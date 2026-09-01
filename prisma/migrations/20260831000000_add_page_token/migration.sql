-- AlterTable: add Page token column for Facebook Graph API comment reading
ALTER TABLE "InstagramAccount" ADD COLUMN "pageToken" TEXT;