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
    "lorebookId" TEXT,
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
    "lorebookIds" TEXT NOT NULL DEFAULT '[]',
    "loreSettings" TEXT NOT NULL DEFAULT '{}',
    "systemPrompt" TEXT NOT NULL DEFAULT '',
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
    "promptLayout" TEXT NOT NULL DEFAULT '[]',
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

-- CreateTable
CREATE TABLE "Lorebook" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdById" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "updatedById" TEXT
);

-- CreateTable
CREATE TABLE "LorebookEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdById" TEXT NOT NULL,
    "lorebookId" TEXT NOT NULL,
    "comment" TEXT NOT NULL DEFAULT '',
    "keys" TEXT NOT NULL DEFAULT '[]',
    "secondaryKeys" TEXT NOT NULL DEFAULT '[]',
    "selectiveLogic" TEXT NOT NULL DEFAULT 'and_any',
    "content" TEXT NOT NULL DEFAULT '',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "constant" BOOLEAN NOT NULL DEFAULT false,
    "position" TEXT NOT NULL DEFAULT 'after_char',
    "depth" INTEGER NOT NULL DEFAULT 4,
    "role" TEXT NOT NULL DEFAULT 'system',
    "order" INTEGER NOT NULL DEFAULT 100,
    "probability" INTEGER NOT NULL DEFAULT 100,
    "inclusionGroup" TEXT NOT NULL DEFAULT '',
    "groupWeight" INTEGER NOT NULL DEFAULT 100,
    "prioritize" BOOLEAN NOT NULL DEFAULT false,
    "sticky" INTEGER NOT NULL DEFAULT 0,
    "cooldown" INTEGER NOT NULL DEFAULT 0,
    "delay" INTEGER NOT NULL DEFAULT 0,
    "excludeRecursion" BOOLEAN NOT NULL DEFAULT false,
    "preventRecursion" BOOLEAN NOT NULL DEFAULT false,
    "delayUntilRecursion" BOOLEAN NOT NULL DEFAULT false,
    "caseSensitive" BOOLEAN,
    "matchWholeWords" BOOLEAN,
    "characterNames" TEXT NOT NULL DEFAULT '[]',
    "characterExclude" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "updatedById" TEXT
);

-- CreateTable
CREATE TABLE "ChatLoreState" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdById" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT '{}',
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

-- CreateIndex
CREATE INDEX "Lorebook_createdById_idx" ON "Lorebook"("createdById");

-- CreateIndex
CREATE INDEX "LorebookEntry_createdById_lorebookId_idx" ON "LorebookEntry"("createdById", "lorebookId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatLoreState_chatId_key" ON "ChatLoreState"("chatId");
