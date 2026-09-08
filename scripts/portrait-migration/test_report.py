import unittest
import report

class ReportTests(unittest.TestCase):
    def test_directive_diagnostics_include_converted_spelling_count_and_scope_once(self):
        warning = {'code':'missing-folder-option','message':'No down pupils here.','folder':'face.pout','attribute':'look.down'}
        text = report.directive_diagnostics({'directives':{
            'bunny_pout~look_down':{'converted':'bunny_pout:look.down','uses':3,'diagnostics':[warning,dict(warning)]},
            'raffles_teasing~gloves':{'converted':'raffles_teasing:gloves','uses':17,'diagnostics':[
                {'code':'unknown-attribute','message':'Unknown gloves','attribute':'gloves'}]},
        }})
        self.assertIn('2 diagnostics across 2 directives and 20 uses',text)
        self.assertIn('[[bunny_pout:look.down]]',text)
        self.assertIn('3 uses',text)
        self.assertIn('face.pout',text)
        self.assertIn('look.down',text)
        self.assertEqual(text.count('No down pupils here.'),1)
        self.assertIn('[[raffles_teasing:gloves]]',text)
        self.assertIn('17 uses',text)

if __name__ == '__main__': unittest.main()
