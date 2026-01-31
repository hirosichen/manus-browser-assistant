/**
 * Extraction validation utilities
 *
 * Validates extracted data against user expectations:
 * - Expected columns (fields user asked for)
 * - Expected row count (minimum rows requested)
 * - Empty field detection
 * - Column consistency
 */

export interface ValidationIssue {
  type: 'missing_column' | 'empty_field' | 'insufficient_rows' | 'inconsistent_columns';
  message: string;
  severity: 'error' | 'warning';
  details?: {
    expected?: string | number;
    actual?: string | number;
    rowIndex?: number;
    fields?: string[];
  };
}

export interface ValidationResult {
  isValid: boolean;
  validRows: number;
  totalRows: number;
  issues: ValidationIssue[];
}

export interface ValidationParams {
  data: Record<string, string>[];
  expectedColumns?: string[];
  expectedMinRows?: number;
}

/**
 * Validate extracted data against expectations
 */
export function validateExtraction(params: ValidationParams): ValidationResult {
  const { data, expectedColumns, expectedMinRows } = params;
  const issues: ValidationIssue[] = [];

  // Handle empty data
  if (!data || data.length === 0) {
    issues.push({
      type: 'insufficient_rows',
      message: 'No data was extracted',
      severity: 'error',
      details: { expected: expectedMinRows ?? 1, actual: 0 },
    });

    return {
      isValid: false,
      validRows: 0,
      totalRows: 0,
      issues,
    };
  }

  // 1. Check row count
  if (expectedMinRows && data.length < expectedMinRows) {
    issues.push({
      type: 'insufficient_rows',
      message: `Expected at least ${expectedMinRows} rows, got ${data.length}`,
      severity: 'warning',
      details: { expected: expectedMinRows, actual: data.length },
    });
  }

  // 2. Check expected columns
  if (expectedColumns && expectedColumns.length > 0) {
    const actualColumns = data.length > 0 ? Object.keys(data[0]) : [];
    const normalizedActual = actualColumns.map(c => c.toLowerCase());

    const missingColumns = expectedColumns.filter(expected => {
      const normalizedExpected = expected.toLowerCase();
      // Check if any actual column contains the expected column name
      return !normalizedActual.some(
        actual =>
          actual.includes(normalizedExpected) ||
          normalizedExpected.includes(actual) ||
          levenshteinDistance(actual, normalizedExpected) <= 2
      );
    });

    if (missingColumns.length > 0) {
      issues.push({
        type: 'missing_column',
        message: `Missing expected columns: ${missingColumns.join(', ')}`,
        severity: 'error',
        details: {
          expected: missingColumns.join(', '),
          actual: actualColumns.join(', '),
        },
      });
    }
  }

  // 3. Check for empty fields and count valid rows
  let validRows = 0;
  const emptyRowIndices: number[] = [];
  const partiallyEmptyRows: { index: number; fields: string[] }[] = [];

  data.forEach((row, index) => {
    const fields = Object.keys(row);
    const emptyFields = fields.filter(key => {
      const value = row[key];
      return value === null || value === undefined || String(value).trim() === '';
    });

    if (emptyFields.length === 0) {
      validRows++;
    } else if (emptyFields.length === fields.length) {
      emptyRowIndices.push(index + 1);
    } else {
      partiallyEmptyRows.push({ index: index + 1, fields: emptyFields });
    }
  });

  // Report completely empty rows
  if (emptyRowIndices.length > 0) {
    issues.push({
      type: 'empty_field',
      message:
        emptyRowIndices.length === 1
          ? `Row ${emptyRowIndices[0]} is completely empty`
          : `Rows ${emptyRowIndices.join(', ')} are completely empty`,
      severity: 'error',
      details: { rowIndex: emptyRowIndices[0] },
    });
  }

  // Report partially empty rows (only if significant)
  if (partiallyEmptyRows.length > 0 && partiallyEmptyRows.length <= 3) {
    partiallyEmptyRows.forEach(({ index, fields }) => {
      issues.push({
        type: 'empty_field',
        message: `Row ${index} has empty fields: ${fields.join(', ')}`,
        severity: 'warning',
        details: { rowIndex: index, fields },
      });
    });
  } else if (partiallyEmptyRows.length > 3) {
    issues.push({
      type: 'empty_field',
      message: `${partiallyEmptyRows.length} rows have some empty fields`,
      severity: 'warning',
    });
  }

  // 4. Check column consistency
  if (data.length > 1) {
    const firstRowKeys = new Set(Object.keys(data[0]));
    let inconsistentRows = 0;

    data.forEach((row) => {
      const rowKeys = Object.keys(row);
      if (
        rowKeys.length !== firstRowKeys.size ||
        !rowKeys.every(k => firstRowKeys.has(k))
      ) {
        inconsistentRows++;
      }
    });

    if (inconsistentRows > 0) {
      issues.push({
        type: 'inconsistent_columns',
        message: `${inconsistentRows} rows have different columns than expected`,
        severity: 'warning',
      });
    }
  }

  // Determine overall validity (only errors make it invalid)
  const hasErrors = issues.some(i => i.severity === 'error');

  return {
    isValid: !hasErrors,
    validRows,
    totalRows: data.length,
    issues,
  };
}

/**
 * Simple Levenshtein distance for fuzzy column matching
 */
function levenshteinDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Format validation result as a human-readable message
 */
export function formatValidationMessage(result: ValidationResult): string {
  if (result.isValid && result.issues.length === 0) {
    return `✓ Extracted ${result.totalRows} rows successfully`;
  }

  const errorCount = result.issues.filter(i => i.severity === 'error').length;
  const warningCount = result.issues.filter(i => i.severity === 'warning').length;

  let message = result.isValid
    ? `✓ Extracted ${result.totalRows} rows`
    : `⚠ Extracted ${result.totalRows} rows`;

  if (errorCount > 0) {
    message += ` with ${errorCount} error${errorCount > 1 ? 's' : ''}`;
  }
  if (warningCount > 0) {
    message += errorCount > 0 ? ` and ${warningCount} warning${warningCount > 1 ? 's' : ''}` : ` with ${warningCount} warning${warningCount > 1 ? 's' : ''}`;
  }

  return message;
}
