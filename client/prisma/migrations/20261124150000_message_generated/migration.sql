-- Written by a model, not typed by a person (server chat_message.generated, migration f8b0d2a4c6e9).
ALTER TABLE "ChatMessage" ADD COLUMN "generated" BOOLEAN NOT NULL DEFAULT false;
