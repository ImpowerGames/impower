FontDetect = (() => {
  const e = () => {
    if (!n) {
      n = !0;
      var e = document.body,
        t = document.body.firstChild,
        i = document.createElement("div");
      (i.id = "fontdetectHelper"),
        (r = document.createElement("span")),
        (r.innerText = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"),
        i.appendChild(r),
        e.insertBefore(i, t),
        (i.style.position = "absolute"),
        (i.style.visibility = "hidden"),
        (i.style.top = "-200px"),
        (i.style.left = "-100000px"),
        (i.style.width = "100000px"),
        (i.style.height = "200px"),
        (i.style.fontSize = "100px");
    }
  };
  t = (e, t) => {
    return e instanceof Element
      ? window.getComputedStyle(e).getPropertyValue(t)
      : window.jQuery
      ? $(e).css(t)
      : "";
  };
  var n = !1,
    i = ["serif", "sans-serif", "monospace", "cursive", "fantasy"],
    r = null;
  return {
    onFontLoaded: (t, i, r, o) => {
      if (t) {
        var s = o && o.msInterval ? o.msInterval : 100,
          a = o && o.msTimeout ? o.msTimeout : 2e3;
        if (i || r) {
          if ((n || e(), this.isFontLoaded(t))) return void (i && i(t));
          var l = this,
            f = new Date().getTime(),
            d = setInterval(() => {
              if (l.isFontLoaded(t)) return clearInterval(d), void i(t);
              var e = new Date().getTime();
              e - f > a && (clearInterval(d), r && r(t));
            }, s);
        }
      }
    },
    isFontLoaded: (t) => {
      var o = 0,
        s = 0;
      n || e();
      for (var a = 0; a < i.length; ++a) {
        if (
          ((r.style.fontFamily = '"' + t + '",' + i[a]),
          (o = r.offsetWidth),
          a > 0 && o != s)
        )
          return !1;
        s = o;
      }
      return !0;
    },
    whichFont: (e) => {
      for (var n = t(e, "font-family"), r = n.split(","), o = r.shift(); o; ) {
        o = o.replace(/^\s*['"]?\s*([^'"]*)\s*['"]?\s*$/, "$1");
        for (var s = 0; s < i.length; s++) if (o == i[s]) return o;
        if (this.isFontLoaded(o)) return o;
        o = r.shift();
      }
      return null;
    },
  };
})();

const throttle = (func, timeFrame) => {
  let lastTime = 0;
  return (...args) => {
    const now = Date.now();
    if (now - lastTime >= timeFrame) {
      func(...args);
      lastTime = now;
    }
  };
};

const vscode = acquireVsCodeApi();

var state = {
  title_html: "",
  screenplay_html: "",
  docuri: "",
  dynamic: false,
  offset: 0,
};
let codeLineElements = [];
let sparkdownconfig;

const applyConfig = () => {
  //update line highlight visibility
  if (sparkdownconfig?.screenplay_preview_synchronized_with_cursor) {
    document.getElementById("linehighlight_active").style.visibility =
      "visible";
    document.getElementById("linehighlight_click").style.visibility = "visible";
  } else {
    document.getElementById("linehighlight_active").style.visibility = "hidden";
    document.getElementById("linehighlight_click").style.visibility = "hidden";
  }

  console.log("update config");
  //update theme
  if (sparkdownconfig?.screenplay_preview_texture) {
    var themeClass = sparkdownconfig.screenplay_preview_theme + "_theme";
    themeClass += " textured";
  }
  document.getElementById("sparkdown-js").setAttribute("class", themeClass);

  //update number alignments
  var pageClasses = "innerpage";
  if (sparkdownconfig?.screenplay_print_scene_numbers == "left")
    pageClasses = "innerpage numberonleft";
  else if (sparkdownconfig?.screenplay_print_scene_numbers == "right")
    pageClasses = "innerpage numberonright";
  else if (sparkdownconfig?.screenplay_print_scene_numbers == "both")
    pageClasses = "innerpage numberonleft numberonright";
  document.getElementById("mainpage").className = pageClasses;
};

const applyHtml = () => {
  codeLineElements = [];
  vscode.setState(state);
  document.getElementById("mainpage").innerHTML = state.screenplay_html;
  if (state.title_html != undefined) {
    document.getElementById("titlepage_container").style.display = "block";
    document.getElementById("titlepage").innerHTML = state.title_html;
  } else {
    document.getElementById("titlepage_container").style.display = "none";
  }
};

const previousState = vscode.getState();
if (previousState != undefined) {
  state = previousState;
  applyHtml();
  window.scrollTo(0, state.offset);
}

window.addEventListener("message", (event) => {
  if (event.data.command == "updateScript") {
    state.screenplay_html = event.data.content;
    applyHtml();
  } else if (event.data.command == "updateTitle") {
    state.title_html = event.data.content;
    applyHtml();
  } else if (event.data.command == "updateFont") {
    var pages = document.getElementsByClassName("page");
    for (var index in pages) {
      if (pages[index].style) {
        pages[index].style.fontFamily = event.data.content;
      }
    }
    vscode.postMessage({
      command: "updateFontResult",
      content: FontDetect.isFontLoaded(event.data.content),
      uri: state.docuri,
    });
  } else if (event.data.command == "removeFont") {
    var pages = document.getElementsByClassName("page");
    for (var index in pages) {
      pages[index].style.fontFamily = "";
    }
  } else if (event.data.command == "updateconfig") {
    sparkdownconfig = event.data.content;
    applyConfig();
  } else if (event.data.command == "showsourceline") {
    scrollToRevealSourceLine(
      event.data.content,
      event.data.linescount,
      event.data.source
    );
  } else if (event.data.command == "setstate") {
    if (event.data.uri !== undefined) {
      state.docuri = event.data.uri;
    }
    if (event.data.dynamic !== undefined) {
      state.dynamic = event.data.dynamic;
    }
    vscode.setState(state);
  } else if (event.data.command == "highlightline") {
    let { previous, next, exact } = getLineElementsAtPageOffset(
      event.data.content
    );
    var highlight = getHighlightLocationAndHeight(previous, next, exact);
    var linehighlight_active = document.getElementById("linehighlight_active");
    linehighlight_active.style.height = highlight.height + "px";
    linehighlight_active.style.top = highlight.location + "px";
  }
});

const getCodeLineElements = () => {
  if (codeLineElements.length > 0) {
    return codeLineElements;
  } else {
    for (const element of document.getElementsByClassName("haseditorline")) {
      const id = element.getAttribute("id");
      if (id == null) continue;
      const line = Number(id.replace("sourceline_", ""));
      if (isNaN(line)) {
        continue;
      }
      codeLineElements.push(line);
    }
  }
  return codeLineElements;
};

const getElement = (number) => {
  return document.getElementById("sourceline_" + number);
};

const getLineElementsAtPageOffset = (offset) => {
  const lines = getCodeLineElements();
  const position = offset - window.scrollY;
  let lo = -1;
  let hi = lines.length - 1;
  while (lo + 1 < hi) {
    const mid = Math.floor((lo + hi) / 2);
    let bounds = getElement(lines[mid]).getBoundingClientRect();
    if (bounds.top + bounds.height >= position) {
      hi = mid;
    } else {
      lo = mid;
    }
  }
  const hiElement = lines[hi];
  const hiBounds = getElement(hiElement).getBoundingClientRect();
  if (hi >= 1 && hiBounds.top > position) {
    const loElement = lines[lo];
    return { previous: loElement, next: hiElement };
  }
  if (
    hi > 1 &&
    hi < lines.length &&
    hiBounds.top + hiBounds.height > position
  ) {
    return {
      previous: hiElement,
      next: lines[hi + 1],
      exact: true,
    };
  }
  return {
    previous: hiElement,
  };
};

const getEditorLineNumberForPageOffset = (offset) => {
  const { previous, next } = getLineElementsAtPageOffset(offset);
  if (document.getElementById("titlepage").getBoundingClientRect().bottom > 0)
    return 0;
  if (previous != undefined) {
    const previousBounds = getElement(previous).getBoundingClientRect();
    const offsetFromPrevious = offset - window.scrollY - previousBounds.top;
    if (next) {
      let progressBetweenElements =
        offsetFromPrevious /
        (getElement(next).getBoundingClientRect().top - previousBounds.top);
      if (progressBetweenElements == Infinity) progressBetweenElements = 0;
      var line = previous + progressBetweenElements * (next - previous);
      return line;
    } else {
      let progressWithinElement = offsetFromPrevious / previousBounds.height;
      var line = previous + progressWithinElement;
      return line;
    }
  }
  return null;
};

const getLineInfoForElements = (line, previous, next) => {
  let scrollTo = 0;
  return { scrollTo: scrollTo, height: linehighlight_activeheight };
};

const scrollToRevealSourceLine = (line, linescount, source) => {
  scrollDisabled = true;
  if (line <= 0) {
    window.scroll(window.scrollX, 0);
    userscroll = true;
    return;
  }
  const { previous, next } = getElementsForSourceLine(line, linescount);
  if (!previous) {
    return;
  }

  const rect = getElement(previous).getBoundingClientRect();
  const previousTop = rect.top;
  let linehighlight_activeheight = rect.height;
  if (next && next !== previous) {
    linehighlight_activeheight = 2;
    // Between two elements. Go to percentage offset between them.
    const betweenProgress = (line - previous) / (next - previous);
    const elementOffset =
      getElement(next).getBoundingClientRect().top - rect.bottom;
    scrollTo = rect.bottom + betweenProgress * elementOffset;
    if (getElement(previous).classList.contains("titlepagetoken")) {
      //the previous item is part of the title page, scroll to top of main page regardless of progress
      scrollTo = document
        .getElementById("screenplay_page")
        .getBoundingClientRect().top;
    }
  } else {
    let progressInElement = 0;
    if (line != undefined) progressInElement = line - Math.floor(line);
    scrollTo = previousTop + rect.height * progressInElement;
  }

  if (getElement(previous) == document.getElementById("mainpage").firstChild) {
    scrollTo = document
      .getElementById("screenplay_page")
      .getBoundingClientRect().top;
  }

  var scrolloptions = {
    top: Math.max(1, window.scrollY + scrollTo),
    left: window.scrollX,
  };

  if (
    source == "click" ||
    getElement(previous).classList.contains("titlepagetoken") ||
    getElement(next).classList.contains("titlepagetoken")
  ) {
    if (source == "click") {
      var linehighlight_active = document.getElementById(
        "linehighlight_active"
      );
      linehighlight_active.style.height = linehighlight_activeheight + "px";
      linehighlight_active.style.top =
        scrollTo -
        document.getElementById("screenplay_page").getBoundingClientRect().top +
        "px";
    }

    //don't scroll to the element, just ensure it's visible in the viewport
    if (scrollTo < 0) {
      //target is before, normal scrolling method works
      console.log("target is before");
    } else if (scrollTo > window.innerHeight) {
      //target is after
      scrolloptions.top =
        window.scrollY + scrollTo + rect.height + 24 - window.innerHeight;
      console.log("target is after");
    } else {
      console.log("target is in window");
      //target is in window, flash the relevant element if applicable
      return;
    }
  }
  window.scroll(scrolloptions);
};

const getElementsForSourceLine = (targetLine, linescount) => {
  const lineNumber = Math.floor(targetLine);
  var exact = document.getElementById("sourceline_" + lineNumber);
  if (exact) {
    return { previous: lineNumber, next: lineNumber };
  } else {
    var previousSearchNumber = lineNumber;
    var nextSearchNumber = lineNumber;
    var previousNumber, nextNumber;
    while (previousNumber == undefined) {
      previousSearchNumber--;
      if (previousSearchNumber < 0) {
        break;
      }
      var el = document.getElementById("sourceline_" + previousSearchNumber);
      if (el != undefined) previousNumber = previousSearchNumber;
    }
    while (nextNumber == undefined) {
      nextSearchNumber++;
      if (nextSearchNumber > linescount) {
        break;
      }
      nextNumber = document.getElementById("sourceline_" + nextSearchNumber);
      var el = document.getElementById("sourceline_" + nextSearchNumber);
      if (el != undefined) nextNumber = nextSearchNumber;
    }
    return { previous: previousNumber, next: nextNumber };
  }
};

scrollDisabled = true;
window.addEventListener(
  "scroll",
  throttle(() => {
    if (!sparkdownconfig?.screenplay_preview_synchronized_with_cursor) {
      return;
    }
    if (scrollDisabled) {
      scrollDisabled = false;
    } else {
      const line = getEditorLineNumberForPageOffset(window.scrollY);
      if (typeof line === "number" && !isNaN(line)) {
        vscode.postMessage({
          command: "revealLine",
          content: line,
          uri: state.docuri,
        });
        state.offset = window.scrollY;
        vscode.setState(state);
      }
    }
  }, 50)
);

const getHighlightLocationAndHeight = (previous, next, exact) => {
  if (exact) {
    next = previous;
  }
  const rect = getElement(previous).getBoundingClientRect();
  const previousTop = rect.top;
  let linehighlight_height = rect.height;
  let linehighlight_location =
    rect.top -
    document.getElementById("screenplay_page").getBoundingClientRect().top;
  if (next && next !== previous) {
    linehighlight_height = 2;
    //located between the two
    const elementOffset =
      getElement(next).getBoundingClientRect().top - rect.bottom;
    linehighlight_location =
      rect.bottom +
      elementOffset * 0.5 -
      document.getElementById("screenplay_page").getBoundingClientRect().top;
  }
  return { height: linehighlight_height, location: linehighlight_location };
};

document.addEventListener("mousedown", (e) => {
  if (!sparkdownconfig?.screenplay_preview_synchronized_with_cursor) {
    return;
  }
  let { previous, next, exact } = getLineElementsAtPageOffset(e.pageY);
  var linehighlight = getHighlightLocationAndHeight(previous, next, exact);
  if (e.detail == 1) {
    //first click, show click indicator
    let linehighlight_click = document.getElementById("linehighlight_click");
    linehighlight_click.style.height = linehighlight.height + "px";
    linehighlight_click.style.top = linehighlight.location + "px";
    linehighlight_click.style.transition = "opacity 0s";
    linehighlight_click.style.opacity = 1;
    setTimeout(() => {
      linehighlight_click.style.transition = "opacity 0.5s";
      linehighlight_click.style.opacity = 0;
    }, 5);
  }
  if (e.detail > 1) {
    //double click
    e.preventDefault();
    let linehighlight_active = document.getElementById("linehighlight_active");
    linehighlight_active.style.height = linehighlight.height + "px";
    linehighlight_active.style.top = linehighlight.location + "px";

    const offset = e.pageY;
    const positiononpage = window.innerHeight / e.pageY;
    const line = Math.floor(getEditorLineNumberForPageOffset(offset));
    if (typeof line === "number" && !isNaN(line)) {
      let charpos = window.getSelection().focusOffset;
      vscode.postMessage({
        command: "changeselection",
        line: Math.floor(line),
        character: charpos,
        positiononpage: positiononpage,
        uri: state.docuri,
      });
    }
  }
});
