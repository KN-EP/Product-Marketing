-- M17: conditions a claim's numbers only hold under (gate G17).
ALTER TABLE "Claim" ADD COLUMN "conditions" TEXT[] DEFAULT ARRAY[]::TEXT[];
