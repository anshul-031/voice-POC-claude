/**
 * Parses an uploaded campaign spreadsheet (Excel/CSV) into contacts.
 *
 * The spreadsheet must contain a phone-number column (matched case-insensitively
 * against CAMPAIGN_LIMITS.PHONE_COLUMN_PATTERN). Every other column becomes a
 * template variable available for the voice agent's system prompt.
 */
import * as XLSX from 'xlsx';
import { CAMPAIGN_LIMITS } from '../types/index.js';
import type { ParsedCampaignSpreadsheet, ParsedCampaignContact } from '../types/index.js';
import { UI_STRINGS } from '../constants/uiStrings.js';
import { extractTemplateVariables } from '../utils/templateVariables.js';

/** The mandatory phone-number column header used in generated templates. */
export const TEMPLATE_PHONE_COLUMN = 'phone';

/** Error codes that map to user-facing messages in the route layer. */
export const CAMPAIGN_PARSE_ERROR = {
  EMPTY: 'empty',
  INVALID: 'invalid',
  NO_PHONE_COLUMN: 'no_phone_column',
  NO_ROWS: 'no_rows',
  TOO_MANY_ROWS: 'too_many_rows',
} as const;

export type CampaignParseErrorCode =
  typeof CAMPAIGN_PARSE_ERROR[keyof typeof CAMPAIGN_PARSE_ERROR];

/** Thrown when a spreadsheet cannot be parsed into a valid contact list. */
export class CampaignParseError extends Error {
  public readonly code: CampaignParseErrorCode;

  constructor(code: CampaignParseErrorCode) {
    super(code);
    this.name = 'CampaignParseError';
    this.code = code;
  }
}

/** Maps a parse error code to a user-facing message. */
export function campaignParseErrorMessage(code: CampaignParseErrorCode): string {
  const messages: Record<CampaignParseErrorCode, string> = {
    [CAMPAIGN_PARSE_ERROR.EMPTY]: UI_STRINGS.api.errors.campaignFileEmpty,
    [CAMPAIGN_PARSE_ERROR.INVALID]: UI_STRINGS.api.errors.campaignFileInvalid,
    [CAMPAIGN_PARSE_ERROR.NO_PHONE_COLUMN]: UI_STRINGS.api.errors.campaignNoPhoneColumn,
    [CAMPAIGN_PARSE_ERROR.NO_ROWS]: UI_STRINGS.api.errors.campaignNoRows,
    [CAMPAIGN_PARSE_ERROR.TOO_MANY_ROWS]: UI_STRINGS.api.errors.campaignTooManyRows,
  };
  return messages[code];
}

type SheetRow = Record<string, unknown>;

/** Reads the first worksheet of the workbook as an array of row objects. */
function readRows(buffer: Buffer): SheetRow[] {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: 'buffer' });
  } catch {
    throw new CampaignParseError(CAMPAIGN_PARSE_ERROR.INVALID);
  }

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new CampaignParseError(CAMPAIGN_PARSE_ERROR.EMPTY);
  }

  const sheet = workbook.Sheets[sheetName];
  return XLSX.utils.sheet_to_json<SheetRow>(sheet, { defval: '' });
}

/** Finds the phone column header among the spreadsheet's columns. */
function findPhoneColumn(columns: string[]): string | null {
  return columns.find((col) => {
    const normalized = col.trim().toLowerCase().replace(/[\s_]+/g, '');
    return CAMPAIGN_LIMITS.PHONE_COLUMN_PATTERN.test(normalized);
  }) || null;
}

/** Normalizes a cell value to a trimmed string. */
function cellToString(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

/**
 * Parse a spreadsheet buffer into a campaign contact list.
 * @throws {CampaignParseError} when the file is empty, invalid, or missing data.
 */
export function parseCampaignSpreadsheet(buffer: Buffer): ParsedCampaignSpreadsheet {
  if (!buffer || buffer.length === 0) {
    throw new CampaignParseError(CAMPAIGN_PARSE_ERROR.EMPTY);
  }

  const rows = readRows(buffer);
  if (rows.length === 0) {
    throw new CampaignParseError(CAMPAIGN_PARSE_ERROR.NO_ROWS);
  }

  const columns = Object.keys(rows[0]);
  const phoneColumn = findPhoneColumn(columns);
  if (!phoneColumn) {
    throw new CampaignParseError(CAMPAIGN_PARSE_ERROR.NO_PHONE_COLUMN);
  }

  const variableColumns = columns.filter((col) => col !== phoneColumn);

  const contacts: ParsedCampaignContact[] = [];
  for (const row of rows) {
    const phoneNumber = cellToString(row[phoneColumn]);
    if (!phoneNumber) continue;

    const variables: Record<string, string> = {};
    for (const col of variableColumns) {
      variables[col] = cellToString(row[col]);
    }
    contacts.push({ phoneNumber, variables });

    if (contacts.length > CAMPAIGN_LIMITS.MAX_CONTACTS) {
      throw new CampaignParseError(CAMPAIGN_PARSE_ERROR.TOO_MANY_ROWS);
    }
  }

  if (contacts.length === 0) {
    throw new CampaignParseError(CAMPAIGN_PARSE_ERROR.NO_ROWS);
  }

  return { phoneColumn, variableColumns, contacts };
}

/**
 * Build a sample contacts template (.xlsx) for a campaign's voice agent.
 *
 * The template has a mandatory phone column plus one column per `{{variable}}`
 * referenced in the agent's system prompt, with a single illustrative sample row.
 */
export function buildCampaignTemplate(systemPrompt: string): Buffer {
  const variables = extractTemplateVariables(systemPrompt);
  const header = [TEMPLATE_PHONE_COLUMN, ...variables];
  const sampleRow: string[] = ['+15551234567', ...variables.map((name) => `Sample ${name}`)];

  const sheet = XLSX.utils.aoa_to_sheet([header, sampleRow]);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, 'Contacts');
  return XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

/**
 * Returns the required columns that are absent from the available columns.
 * Comparison is trimmed and case-sensitive to match the generated headers.
 */
export function getMissingRequiredColumns(
  availableColumns: string[],
  requiredColumns: string[],
): string[] {
  const available = new Set(availableColumns.map((col) => col.trim()));
  return requiredColumns.filter((col) => !available.has(col.trim()));
}
