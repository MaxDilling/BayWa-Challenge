import zipfile

from harness.xlsx import convert

NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'
PARTS = {
    "xl/workbook.xml": f'<workbook {NS} xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
                       '<sheets><sheet name="T1" sheetId="1" r:id="rId1"/></sheets></workbook>',
    "xl/_rels/workbook.xml.rels": '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                                  '<Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
    "xl/sharedStrings.xml": f"<sst {NS}><si><t>turbine_name</t></si><si><t>timestamp</t></si><si><t>wind_speed</t></si><si><t>test_set</t></si>"
                            "<si><t>T1</t></si></sst>",
    "xl/styles.xml": f'<styleSheet {NS}><numFmts><numFmt numFmtId="165" formatCode="yyyy\\-mm\\-dd\\ hh:mm:ss"/>'
                     '</numFmts><cellXfs><xf numFmtId="0"/><xf numFmtId="165"/></cellXfs></styleSheet>',
    # 46204 + 1/144 days = 2026-07-01 00:10 with Excel's rounding error; C2 is missing, as an empty cell is in Excel
    "xl/worksheets/sheet1.xml": f'<worksheet {NS}><sheetData>'
                                '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c>'
                                '<c r="C1" t="s"><v>2</v></c><c r="D1" t="s"><v>3</v></c></row>'
                                '<row r="2"><c r="A2" t="s"><v>4</v></c><c r="B2" s="1"><v>46204.006944444453</v></c>'
                                '<c r="D2" t="b"><v>0</v></c></row>'
                                '<row r="3"><c r="A3" t="s"><v>4</v></c><c r="B3" s="1"><v>46204.013888888891</v></c>'
                                '<c r="C3"><v>4.8652860000000002</v></c><c r="D3"><v>1</v></c></row>'
                                '<row r="4"/></sheetData></worksheet>',
}


def test_xlsx_becomes_csv_with_wall_clock_times_and_empty_missing_values(tmp_path):
    with zipfile.ZipFile(tmp_path / "T1_data.xlsx", "w") as z:
        for name, xml in PARTS.items():
            z.writestr(name, xml)
    (tmp_path / "~$T1_data.xlsx").write_bytes(b"Excel lock file")
    assert convert(tmp_path) == [tmp_path / "csv" / "T1_data.csv"]
    assert (tmp_path / "csv" / "T1_data.csv").read_text() == (
        "turbine_name,timestamp,wind_speed,test_set\n"
        "T1,2026-07-01 00:10,,0\n"
        "T1,2026-07-01 00:20,4.865286,1\n"
    )
