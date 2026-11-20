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
    "folder" TEXT NOT NULL DEFAULT '',
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
    "summary" TEXT NOT NULL DEFAULT '',
    "tags" TEXT NOT NULL DEFAULT '[]',
    "folder" TEXT NOT NULL DEFAULT '',
    "mutedIds" TEXT NOT NULL DEFAULT '[]',
    "background" TEXT,
    "objectives" TEXT NOT NULL DEFAULT '[]',
    "contentRating" TEXT,
    "lines" TEXT NOT NULL DEFAULT '[]',
    "veils" TEXT NOT NULL DEFAULT '[]',
    "tableNotes" TEXT NOT NULL DEFAULT '[]',
    "paused" BOOLEAN NOT NULL DEFAULT false,
    "campaignId" TEXT,
    "scenarioId" TEXT,
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
    "images" TEXT NOT NULL DEFAULT '[]',
    "xCarded" BOOLEAN NOT NULL DEFAULT false,
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
    "logitBias" TEXT NOT NULL DEFAULT '{}',
    "negativePrompt" TEXT NOT NULL DEFAULT '',
    "guidanceScale" REAL,
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
    "api" TEXT NOT NULL DEFAULT 'chat',
    "instructTemplate" TEXT NOT NULL DEFAULT 'chatml',
    "roles" TEXT NOT NULL DEFAULT '[]',
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

-- CreateTable
CREATE TABLE "RegexScript" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdById" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "find" TEXT NOT NULL,
    "replace" TEXT NOT NULL DEFAULT '',
    "placements" TEXT NOT NULL DEFAULT '["ai_output"]',
    "displayOnly" BOOLEAN NOT NULL DEFAULT false,
    "promptOnly" BOOLEAN NOT NULL DEFAULT false,
    "minDepth" INTEGER,
    "maxDepth" INTEGER,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "updatedById" TEXT
);

-- CreateIndex
CREATE INDEX "RegexScript_createdById_idx" ON "RegexScript"("createdById");

-- CreateTable
CREATE TABLE "QuickReply" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdById" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "action" TEXT NOT NULL DEFAULT 'send',
    "channel" TEXT NOT NULL DEFAULT 'ic',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "autoRun" TEXT NOT NULL DEFAULT 'none',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "updatedById" TEXT
);

-- CreateIndex
CREATE INDEX "QuickReply_createdById_idx" ON "QuickReply"("createdById");

-- CreateTable
CREATE TABLE "DataDocument" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdById" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'global',
    "scopeId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "updatedById" TEXT
);

-- CreateIndex
CREATE INDEX "DataDocument_createdById_idx" ON "DataDocument"("createdById");

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdById" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "premise" TEXT NOT NULL DEFAULT '',
    "genre" TEXT NOT NULL DEFAULT '',
    "dials" TEXT NOT NULL DEFAULT '{}',
    "themes" TEXT NOT NULL DEFAULT '[]',
    "pillars" TEXT NOT NULL DEFAULT '{}',
    "structure" TEXT,
    "truths" TEXT NOT NULL DEFAULT '[]',
    "characters" TEXT NOT NULL DEFAULT '',
    "resolutionMode" TEXT,
    "gmStyle" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "updatedById" TEXT
);

-- CreateIndex
CREATE INDEX "Campaign_createdById_idx" ON "Campaign"("createdById");

-- CreateTable
CREATE TABLE "Scenario" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdById" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "campaignId" TEXT,
    "premise" TEXT NOT NULL DEFAULT '',
    "hook" TEXT NOT NULL DEFAULT '',
    "stakes" TEXT NOT NULL DEFAULT '',
    "situation" TEXT NOT NULL DEFAULT '',
    "cast" TEXT NOT NULL DEFAULT '[]',
    "places" TEXT NOT NULL DEFAULT '[]',
    "clocks" TEXT NOT NULL DEFAULT '[]',
    "secrets" TEXT NOT NULL DEFAULT '[]',
    "beats" TEXT NOT NULL DEFAULT '[]',
    "outcomes" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "updatedById" TEXT
);

-- CreateIndex
CREATE INDEX "Scenario_createdById_idx" ON "Scenario"("createdById");

-- CreateTable
CREATE TABLE "CharacterExpression" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdById" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "image" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "updatedById" TEXT
);

-- CreateIndex
CREATE INDEX "CharacterExpression_createdById_characterId_idx" ON "CharacterExpression"("createdById", "characterId");

