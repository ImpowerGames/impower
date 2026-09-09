"""Legacy filter reader and project-configured conversion, adapted from #483.

Only the OLD visibility oracle lives here. New visibility is always evaluated
by the production TypeScript attribute core via evaluate.ts.
"""
import collections
import re
import xml.etree.ElementTree as ET

def configure(config, source):
    globals().update({key.upper(): value for key, value in config.items()})
    global MULTIWORD_OPTIONS, GROUP_FILTER_PREFIXES, FILTERS, COMPOSITES, SWITCH_FILTERS
    MULTIWORD_OPTIONS = {tuple(k.split(':')): v for k, v in config['multiword_options'].items()}
    GROUP_FILTER_PREFIXES = tuple(config['group_filter_prefixes'])
    FILTERS, COMPOSITES = {}, {}
    for match in re.finditer(r'define (\w+) as filter with\s*\n(.*?)\nend', source, re.S):
        name, body = match.groups()
        def values(key):
            item = re.search(key + r'\s*=\s*\{(.*?)\}', body, re.S)
            return re.findall(r'"([^"]*)"', item[1]) if item else []
        FILTERS[name] = {'includes': values('includes'), 'excludes': values('excludes')}
    for match in re.finditer(r'define (\w+) as filtered_image with\s*\n(.*?)\nend', source, re.S):
        name, body = match.groups()
        image = re.search(r'image\s*=\s*(\w+)', body)
        filters = re.search(r'filters\s*=\s*\{(.*?)\}', body, re.S)
        if not image or not filters:
            raise ValueError(f'{name}: expected a legacy image and filters list')
        COMPOSITES[name] = {'image': image[1], 'filters': re.findall(r'\b\w+\b', filters[1])}
    SWITCH_FILTERS = [name for name in FILTERS if not name.startswith(GROUP_FILTER_PREFIXES)
                      and name not in CLOTHES_FILTERS and name not in PHONE_FILTERS
                      and name not in SWITCH_FILTER_EXCLUSIONS]

def tag_re(tag):
    return re.compile(r'\b' + tag + r'\b')

def tag_matches(name, tag):
    return bool(tag) and bool(tag_re(tag).search(name))

IS_FILTERABLE = re.compile(r'\bfilter\b')
IS_DEFAULT = re.compile(r'\bdefault\b')
IS_DEFAULT_LENIENT = re.compile(r'\bdefault\d*\b')

def old_removed(name, includes, excludes):
    if not IS_FILTERABLE.search(name):
        return False
    if any(tag_matches(name, t) for t in excludes):
        return True
    if not IS_DEFAULT.search(name) and all(t and not tag_matches(name, t) for t in includes):
        return True
    return False

def nested_filters(name):
    """getNestedFilters: filters of a composite plus its base's, flattened."""
    if name in COMPOSITES:
        c = COMPOSITES[name]
        return [FILTERS.get(f, {'includes': [], 'excludes': []}) for f in c['filters']] + nested_filters(c['image'])
    return []

def root_image(name):
    while name in COMPOSITES:
        name = COMPOSITES[name]['image']
    return name

def old_filter_for(directive_name):
    parts = directive_name.split('~')
    base, names = parts[0], parts[1:]
    fs = [FILTERS.get(n, {'includes': [], 'excludes': []}) for n in names] + nested_filters(base)
    return {'includes': [t for f in fs for t in f['includes']],
            'excludes': [t for f in fs for t in f['excludes']]}

# ----------------------------------------------------------------------------
# SVG trees
# ----------------------------------------------------------------------------
class Node:
    def __init__(self, id_, children, author_name=None):
        self.id = id_
        self.author_name = id_ if author_name is None else author_name
        self.children = children
        self.new = None      # converted: dict(label, conds, default, plain)
    def filterable(self):
        return bool(self.id) and bool(IS_FILTERABLE.search(self.id))

def build(el):
    kids = [build(c) for c in el]
    label = next((el.attrib[key] for key in ('data-name', '{http://www.serif.com/}id',
                    '{http://www.inkscape.org/namespaces/inkscape}label') if key in el.attrib), None)
    return Node(el.get('id'), kids, label)

def load_svg(path):
    return build(ET.parse(path).getroot())

def old_visible(tree, flt):
    vis = set()
    def walk(n):
        if n.id and old_removed(n.id, flt['includes'], flt['excludes']):
            return
        if n.filterable():
            vis.add(n.id)
        for c in n.children:
            walk(c)
    walk(tree)
    return vis

# ----------------------------------------------------------------------------
def group_conds_from_words(words):
    """(group, option) pairs spelled in the id, and the words they consumed."""
    conds, consumed, renamed = [], set(), []
    i = 0
    while i < len(words):
        w = words[i]
        if w in GROUP_WORDS and i + 1 < len(words):
            nxt = words[i + 1]
            if nxt in DESCRIPTIVE_AFTER_GROUP or (w == 'clothes' and nxt not in CLOTHES_OPTIONS):
                i += 1
                continue
            opt = MULTIWORD_OPTIONS.get((w, nxt), nxt)
            m = re.match(r'^([a-z]+)(\d+)$', opt)
            if m:
                opt = m.group(1)
                renamed.append(nxt)
            n_opt_words = len(opt.split('-'))
            conds.append((w, opt))
            consumed.update([i] + list(range(i + 1, i + 1 + n_opt_words)))
            i += 1 + n_opt_words
        else:
            i += 1
    return conds, consumed, renamed

def convert_layer(id_, character, enclosing_face):
    """Return dict(label, conds: {group: set(options)}, default: bool, notes)."""
    words = id_.split('-')
    is_default = bool(IS_DEFAULT_LENIENT.search(id_))
    conds = collections.OrderedDict()
    notes = []
    if is_default and not IS_DEFAULT.search(id_):
        notes.append('export renamed a duplicate default')
    def add(g, o):
        conds.setdefault(g, set()).add(o)
    gconds, consumed, renamed = group_conds_from_words(words)
    for g, o in gconds:
        add(g, o)
    for r in renamed:
        notes.append(f'export renamed a duplicate option: {r}')
    consumed_words = set(words[i] for i in consumed)
    # Switch filters: include match -> S.on (non-default layers only), exclude match -> S.off
    for s in SWITCH_FILTERS:
        f = FILTERS[s]
        inc = any(tag_matches(id_, t) for t in f['includes'])
        exc = any(tag_matches(id_, t) for t in f['excludes'])
        if exc:
            add(s.replace('_', '-'), 'off')
        elif inc and not is_default:
            add(s.replace('_', '-'), 'on')
            consumed_words.add(s)
            for t in f['includes']:
                if tag_matches(id_, t):
                    consumed_words.update(t.split('-'))
    # Clothes-option filters with extra excludes (coat hides loose gloves, pjs hides on-sleeve)
    for fname, opt in CLOTHES_FILTERS.items():
        f = FILTERS[fname]
        extra_exc = [t for t in f['excludes'] if not t.startswith('clothes-(?!') and t != 'jacket']
        for t in extra_exc:
            if tag_matches(id_, t):
                notes.append(f'hidden by {opt}')
                add('clothes', 'not-' + opt)
    # Phone family -> arms group. down is the default; phone-hold-X are sub-options of phone.
    if tag_matches(id_, 'arm-down'):
        add('arms', 'down')
        consumed_words.add('down')
    for fname, opt in PHONE_FILTERS.items():
        f = FILTERS[fname]
        if fname in ('phone', 'script'):
            if tag_matches(id_, opt) and not is_default and not any(
                    tag_matches(id_, t) for t in FILTERS['phone']['excludes'] if t.startswith('phone-hold')):
                add('arms', opt)
                consumed_words.add(opt)
        else:
            keeps = HOLD_KEEPS_DOWN.get(opt)
            other = ({'left', 'right'} - {keeps}).pop() if keeps else None
            if tag_matches(id_, PHONE_TAGS[opt]):
                add('arms', opt)
                consumed_words.update(PHONE_TAGS[opt].split('-'))
            elif any(tag_matches(id_, t) for t in f['includes'] if t.startswith('arm-down')):
                add('arms', opt)
            elif keeps and tag_matches(id_, 'arm-down') and keeps in words and other not in words:
                # e.g. arm-down-hand-right stays down while the phone is held in the left hand
                add('arms', opt)
    # Character-specific overlay switches are project configuration.
    for switch in OVERLAY_SWITCHES.get(character, []):
        if switch in words and not is_default:
            add(switch, 'on')
            consumed_words.add(switch)
            if 'clothes' in conds:
                conds['clothes'].discard(switch)
                if not conds['clothes']:
                    del conds['clothes']
    label_words = [w for w in words if w not in ('filter', 'default') and w not in consumed_words
                   and w != enclosing_face]
    # `defaults`: {group: option} this layer establishes as the folder's resting
    # option. Filled in by the folder pass in convert_tree.
    return {'label': '-'.join(label_words), 'conds': conds, 'default': is_default,
            'defaults': {}, 'notes': notes}

def format_new(n):
    """Spell a converted layer in the new grammar. `:default` at the end marks
    the layer as part of the resting look."""
    parts = []
    for g, opts in n['conds'].items():
        opts = sorted(opts)
        d = n['defaults'].get(g)
        if d in opts:
            opts.remove(d)
            opts.insert(0, d)
        parts.append(g + '.' + '.'.join(opts))
    body = ':'.join(([n['label']] if n['label'] else []) + parts)
    if n['default'] and n['defaults']:
        body += ':default'
    return body

def assign_defaults(siblings, idx, file_singles):
    """Folder pass: a default layer establishes the resting option of every
    named-option group it is conditioned on. Switches rest at off by rule. When
    the layer lists several options of one group (an OR), the resting option is
    the one a sibling default layer carries alone, else the one that is a
    resting option elsewhere in the file."""
    defaults = [s for s in siblings if s.new and s.new['default']]
    for g in {g for s in defaults for g in s.new['conds']}:
        if is_switch(idx, g):
            continue
        singles = set()
        for s in defaults:
            opts = [o for o in s.new['conds'].get(g, ()) if not o.startswith('not-')]
            if len(opts) == 1:
                singles.add(opts[0])
        for s in defaults:
            real = [o for o in s.new['conds'].get(g, ()) if not o.startswith('not-')]
            if not real:
                continue
            if len(real) == 1:
                s.new['defaults'][g] = real[0]
            else:
                common = set(real)
                for t in defaults:
                    t_opts = {o for o in t.new['conds'].get(g, ()) if not o.startswith('not-')}
                    if t_opts:
                        common &= t_opts
                shared = ([o for o in sorted(real) if o in singles]
                          or [o for o in sorted(real) if o in file_singles.get(g, ())]
                          or (sorted(common) if len(common) == 1 else []))
                s.new['defaults'][g] = shared[0] if shared else sorted(real)[0]
                if not shared:
                    s.new['notes'].append(f'ambiguous default for {g}')
        marks = {s.new['defaults'][g] for s in defaults if g in s.new['defaults']}
        if len(marks) > 1:
            for s in defaults:
                if g in s.new['defaults']:
                    s.new['notes'].append(f'two defaults for {g} in one folder: {sorted(marks)}')

def convert_tree(tree, character):
    def walk(n, enclosing_face):
        if n.filterable():
            if not IS_FILTERABLE.search(n.author_name or ''):
                raise ValueError(f'{n.id}: expected a legacy filter label in explicit author metadata')
            n.new = convert_layer(n.author_name, character, enclosing_face)
            face = n.new['conds'].get('face')
            if face and len(face) == 1:
                enclosing_face = next(iter(face))
        for c in n.children:
            walk(c, enclosing_face)
    walk(tree, None)
    # Dead layers: filterable, not default, no condition -> the current game never
    # shows them. Give them the condition the words suggest, else park them.
    idx = group_index(tree)
    def dead(n):
        if n.new and not n.new['default'] and not n.new['conds'] and n.id not in DEAD_LAYER_TABLE:
            words = n.author_name.split('-')
            hit = None
            for w in reversed(words):
                for g, opts in idx.items():
                    if g not in DEAD_INFERENCE_EXCLUSIONS and w in opts and not is_switch(idx, g):
                        hit = (g, w)
                        break
                if hit:
                    break
            if hit:
                n.new['conds'][hit[0]] = {hit[1]}
                n.new['label'] = '-'.join(w for w in n.new['label'].split('-') if w != hit[1])
            else:
                n.new['conds']['hidden'] = {'on'}
            n.new['notes'].append('dead layer in the current art (no filter ever showed it)')
        for c in n.children:
            dead(c)
    dead(tree)
    def table(n):
        if n.new and n.id in DEAD_LAYER_TABLE:
            g, o, d = DEAD_LAYER_TABLE[n.id]
            n.new['conds'][g] = {o}
            n.new['default'] = d
            n.new['label'] = '-'.join(w for w in n.new['label'].split('-') if w not in (o, g))
            n.new['notes'].append('dead layer in the current art, condition assigned by table')
        for c in n.children:
            table(c)
    table(tree)
    idx = group_index(tree)
    def expand_not(n):
        if n.new:
            for g, opts in list(n.new['conds'].items()):
                nots = [o for o in opts if o.startswith('not-')]
                if nots:
                    others = set(idx[g]) - {o[4:] for o in nots}
                    n.new['conds'][g] = (opts - set(nots)) | others
        for c in n.children:
            expand_not(c)
    expand_not(tree)
    file_singles = collections.defaultdict(set)
    def singles(n):
        if n.new and n.new['default']:
            for g, opts in n.new['conds'].items():
                real = [o for o in opts if not o.startswith('not-')]
                if len(real) == 1 and not is_switch(idx, g):
                    file_singles[g].add(real[0])
        for c in n.children:
            singles(c)
    singles(tree)
    def folders(n):
        if n.children:
            assign_defaults(n.children, idx, file_singles)
            for c in n.children:
                folders(c)
    folders(tree)

# ----------------------------------------------------------------------------
# New semantics
# ----------------------------------------------------------------------------
def group_index(tree):
    idx = collections.defaultdict(set)
    def walk(n):
        if n.new:
            for g, opts in n.new['conds'].items():
                idx[g].update(o for o in opts if not o.startswith('not-'))
        for c in n.children:
            walk(c)
    walk(tree)
    return idx

def is_switch(idx, g):
    return g in idx and idx[g] <= {'on', 'off'}

def convert_filter_name(fname, base_idx, old_names_in_directive):
    """Old filter name -> new attribute spelling(s), most-bare first."""
    if fname in PHONE_FILTERS:
        return [PHONE_FILTERS[fname], 'arms.' + PHONE_FILTERS[fname]]
    if fname in CLOTHES_FILTERS:
        return [CLOTHES_FILTERS[fname], 'clothes.' + CLOTHES_FILTERS[fname]]
    for pre in GROUP_FILTER_PREFIXES:
        if fname.startswith(pre):
            g = pre[:-1]
            o = fname[len(pre):].replace('_', '-')
            partner = {'face': 'eyebrows', 'eyebrows': 'face'}.get(g)
            if o not in base_idx.get(g, set()):
                return ['']
            bare_ok = False
            if o in base_idx.get(g, set()):
                others = [gg for gg, opts in base_idx.items() if o in opts and gg != g]
                if not others:
                    bare_ok = True
                elif partner and others == [partner] and f'{partner}_{o}' in old_names_in_directive:
                    bare_ok = True
            cands = [f'{g}.{o}']
            if g == 'look':
                cands = [f'{g}.{o}', f'eyes.open:{g}.{o}']
            if bare_ok and g in ('face', 'eyebrows'):
                cands = [o] + cands
            return cands
    return [fname.replace('_', '-')]

# ----------------------------------------------------------------------------
