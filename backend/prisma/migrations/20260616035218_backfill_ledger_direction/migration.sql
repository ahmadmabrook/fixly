-- Backfill ledger direction for rows written before the column existed.
UPDATE "ledger_entries" SET "direction" = 'CREDIT'::"LedgerDirection"
  WHERE "direction" IS NULL AND "type" IN ('CHARGE', 'CAPTURE', 'FEE', 'ADJUSTMENT');
UPDATE "ledger_entries" SET "direction" = 'DEBIT'::"LedgerDirection"
  WHERE "direction" IS NULL AND "type" IN ('REFUND', 'PAYOUT', 'DISPUTE', 'CHARGEBACK');
