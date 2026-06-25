import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import {
  parseCampaignSpreadsheet,
  campaignParseErrorMessage,
  CampaignParseError,
  CAMPAIGN_PARSE_ERROR,
  buildCampaignTemplate,
  getMissingRequiredColumns,
} from '../services/excelParser.js';
import { UI_STRINGS } from '../constants/uiStrings.js';

/** Build an .xlsx buffer from an array-of-arrays (first row = headers). */
function buildXlsx(rows: unknown[][]): Buffer {
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, 'Sheet1');
  return XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

describe('parseCampaignSpreadsheet', () => {
  it('parses phone column and variable columns', () => {
    const buffer = buildXlsx([
      ['phone', 'name', 'city'],
      ['+15551230001', 'Sam', 'NYC'],
      ['+15551230002', 'Ada', 'LA'],
    ]);

    const result = parseCampaignSpreadsheet(buffer);
    expect(result.phoneColumn).toBe('phone');
    expect(result.variableColumns).toEqual(['name', 'city']);
    expect(result.contacts).toEqual([
      { phoneNumber: '+15551230001', variables: { name: 'Sam', city: 'NYC' } },
      { phoneNumber: '+15551230002', variables: { name: 'Ada', city: 'LA' } },
    ]);
  });

  it('matches alternative phone column headers case-insensitively', () => {
    const buffer = buildXlsx([
      ['Mobile Number', 'first_name'],
      ['+15551230003', 'Kai'],
    ]);
    const result = parseCampaignSpreadsheet(buffer);
    expect(result.phoneColumn).toBe('Mobile Number');
    expect(result.contacts[0].variables).toEqual({ first_name: 'Kai' });
  });

  it('skips rows without a phone number', () => {
    const buffer = buildXlsx([
      ['phone', 'name'],
      ['', 'NoPhone'],
      ['+15551230004', 'HasPhone'],
    ]);
    const result = parseCampaignSpreadsheet(buffer);
    expect(result.contacts).toHaveLength(1);
    expect(result.contacts[0].phoneNumber).toBe('+15551230004');
  });

  it('coerces non-string cell values to strings', () => {
    const buffer = buildXlsx([
      ['phone', 'age'],
      [15551230005, 42],
    ]);
    const result = parseCampaignSpreadsheet(buffer);
    expect(result.contacts[0].phoneNumber).toBe('15551230005');
    expect(result.contacts[0].variables.age).toBe('42');
  });

  it('throws EMPTY for an empty buffer', () => {
    expect(() => parseCampaignSpreadsheet(Buffer.alloc(0)))
      .toThrowError(new CampaignParseError(CAMPAIGN_PARSE_ERROR.EMPTY));
  });

  it('throws INVALID for an unreadable buffer', () => {
    // 'PK\x03\x04' is the ZIP magic; .xlsx is a zip, so a corrupt zip makes XLSX.read throw.
    const garbage = Buffer.from('PK\u0003\u0004corrupted-zip-payload-not-a-real-xlsx', 'binary');
    try {
      parseCampaignSpreadsheet(garbage);
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(CampaignParseError);
      expect((err as CampaignParseError).code).toBe(CAMPAIGN_PARSE_ERROR.INVALID);
    }
  });

  it('throws NO_PHONE_COLUMN when no phone-like header exists', () => {
    const buffer = buildXlsx([
      ['name', 'city'],
      ['Sam', 'NYC'],
    ]);
    try {
      parseCampaignSpreadsheet(buffer);
      throw new Error('should have thrown');
    } catch (err) {
      expect((err as CampaignParseError).code).toBe(CAMPAIGN_PARSE_ERROR.NO_PHONE_COLUMN);
    }
  });

  it('throws NO_ROWS when there are no data rows', () => {
    const buffer = buildXlsx([['phone', 'name']]);
    try {
      parseCampaignSpreadsheet(buffer);
      throw new Error('should have thrown');
    } catch (err) {
      expect((err as CampaignParseError).code).toBe(CAMPAIGN_PARSE_ERROR.NO_ROWS);
    }
  });

  it('throws NO_ROWS when every row is missing a phone number', () => {
    const buffer = buildXlsx([
      ['phone', 'name'],
      ['', 'A'],
      ['', 'B'],
    ]);
    try {
      parseCampaignSpreadsheet(buffer);
      throw new Error('should have thrown');
    } catch (err) {
      expect((err as CampaignParseError).code).toBe(CAMPAIGN_PARSE_ERROR.NO_ROWS);
    }
  });
  it('throws TOO_MANY_ROWS when exceeding the contact limit', () => {
    const rows: unknown[][] = [['phone', 'name']];
    for (let i = 0; i < 1001; i++) {
      rows.push([`+1555000${i}`, `User${i}`]);
    }
    const buffer = buildXlsx(rows);
    try {
      parseCampaignSpreadsheet(buffer);
      throw new Error('should have thrown');
    } catch (err) {
      expect((err as CampaignParseError).code).toBe(CAMPAIGN_PARSE_ERROR.TOO_MANY_ROWS);
    }
  });
});

describe('campaignParseErrorMessage', () => {
  it('maps every error code to a user-facing message', () => {
    expect(campaignParseErrorMessage(CAMPAIGN_PARSE_ERROR.EMPTY)).toBe(UI_STRINGS.api.errors.campaignFileEmpty);
    expect(campaignParseErrorMessage(CAMPAIGN_PARSE_ERROR.INVALID)).toBe(UI_STRINGS.api.errors.campaignFileInvalid);
    expect(campaignParseErrorMessage(CAMPAIGN_PARSE_ERROR.NO_PHONE_COLUMN))
      .toBe(UI_STRINGS.api.errors.campaignNoPhoneColumn);
    expect(campaignParseErrorMessage(CAMPAIGN_PARSE_ERROR.NO_ROWS)).toBe(UI_STRINGS.api.errors.campaignNoRows);
    expect(campaignParseErrorMessage(CAMPAIGN_PARSE_ERROR.TOO_MANY_ROWS))
      .toBe(UI_STRINGS.api.errors.campaignTooManyRows);
  });
});

describe('buildCampaignTemplate', () => {
  /** Reads a generated template buffer back into rows for assertions. */
  function readTemplate(buffer: Buffer): Record<string, unknown>[] {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
  }

  it('includes a phone column and one column per prompt variable', () => {
    const buffer = buildCampaignTemplate('Hi {{name}}, your appointment in {{city}} is confirmed.');
    const rows = readTemplate(buffer);
    expect(rows).toHaveLength(1);
    const columns = Object.keys(rows[0]);
    expect(columns).toEqual(['phone', 'name', 'city']);
    expect(String(rows[0].phone)).toContain('+1');
    expect(rows[0].name).toBe('Sample name');
    expect(rows[0].city).toBe('Sample city');
  });

  it('produces a phone-only template when the prompt has no variables', () => {
    const buffer = buildCampaignTemplate('You are a helpful assistant.');
    const rows = readTemplate(buffer);
    expect(Object.keys(rows[0])).toEqual(['phone']);
  });
});

describe('getMissingRequiredColumns', () => {
  it('returns required columns absent from the available set', () => {
    expect(getMissingRequiredColumns(['phone', 'name'], ['name', 'city'])).toEqual(['city']);
  });

  it('returns an empty array when all required columns are present (trimmed)', () => {
    expect(getMissingRequiredColumns([' name ', 'city'], ['name', 'city'])).toEqual([]);
  });

  it('returns an empty array when nothing is required', () => {
    expect(getMissingRequiredColumns(['phone'], [])).toEqual([]);
  });
});
