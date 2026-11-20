-- CreateTable
CREATE TABLE "Character" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdById" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "personality" TEXT NOT NULL DEFAULT '',
    "scenario" TEXT NOT NULL DEFAULT '',
    "firstMessage" TEXT NOT NULL DEFAULT '',
    "alternateGreetings" TEXT NOT NULL DEFAULT '[]',
    "exampleMessages" TEXT NOT NULL DEFAULT '',
    "systemPrompt" TEXT NOT NULL DEFAULT '',
    "postHistoryInstructions" TEXT NOT NULL DEFAULT '',
    "creatorNotes" TEXT NOT NULL DEFAULT '',
    "creator" TEXT NOT NULL DEFAULT '',
    "characterVersion" TEXT NOT NULL DEFAULT '',
    "tags" TEXT NOT NULL DEFAULT '[]',
    "avatar" TEXT,
    "favourite" BOOLEAN NOT NULL DEFAULT false,
    "extensions" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "updatedById" TEXT
);

-- CreateTable
CREATE TABLE "Persona" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdById" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "avatar" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "updatedById" TEXT
);

-- CreateTable
CREATE TABLE "Chat" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdById" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'character',
    "characterIds" TEXT NOT NULL DEFAULT '[]',
    "personaId" TEXT,
    "presetId" TEXT,
    "endpointId" TEXT,
    "authorNote" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "updatedById" TEXT
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdById" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "parentId" TEXT,
    "role" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'ic',
    "speakerCharacterId" TEXT,
    "swipes" TEXT NOT NULL DEFAULT '[]',
    "swipeIndex" INTEGER NOT NULL DEFAULT 0,
    "bookmarked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "updatedById" TEXT
);

-- CreateTable
CREATE TABLE "GenerationPreset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdById" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "temperature" REAL NOT NULL,
    "topP" REAL NOT NULL,
    "topK" INTEGER NOT NULL,
    "repetitionPenalty" REAL NOT NULL,
    "maxTokens" INTEGER NOT NULL,
    "contextTokens" INTEGER NOT NULL,
    "stop" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "updatedById" TEXT
);

-- CreateTable
CREATE TABLE "ModelEndpoint" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdById" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL DEFAULT '',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "updatedById" TEXT
);

-- CreateIndex
CREATE INDEX "Character_createdById_idx" ON "Character"("createdById");

-- CreateIndex
CREATE INDEX "Persona_createdById_idx" ON "Persona"("createdById");

-- CreateIndex
CREATE INDEX "Chat_createdById_idx" ON "Chat"("createdById");

-- CreateIndex
CREATE INDEX "ChatMessage_createdById_chatId_idx" ON "ChatMessage"("createdById", "chatId");

-- CreateIndex
CREATE INDEX "GenerationPreset_createdById_idx" ON "GenerationPreset"("createdById");

-- CreateIndex
CREATE INDEX "ModelEndpoint_createdById_idx" ON "ModelEndpoint"("createdById");
