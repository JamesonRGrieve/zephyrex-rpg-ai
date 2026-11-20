// SPDX-License-Identifier: AGPL-3.0-or-later
'use client';

import type { ZephyrexClientExtension } from 'zephyrex';

function RPGDashboard() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Zephyrex RPG AI</h1>
      <p>AI roleplay and AI game master on the Zephyrex framework: AI characters and a GM that play inside the wiki's world and at the VTT's table.</p>
    </div>
  );
}

function RPGSettings() {
  return (
    <div className="p-4">
      <h2 className="text-lg font-semibold mb-2">RPG Settings</h2>
      <p>Configure your campaign extensions.</p>
    </div>
  );
}

export const rpgExtension: ZephyrexClientExtension = {
  name: 'rpg',
  displayName: 'Zephyrex RPG AI',
  description: 'AI characters and a GM that play inside the wiki's world and at the VTT's table',
  serverExtension: 'genealogy',
  pages: [
    {
      path: 'rpg',
      component: RPGDashboard,
    },
  ],
  navItems: [
    {
      title: 'Zephyrex RPG AI',
      url: '/rpg',
    },
  ],
  settingsPanel: RPGSettings,
};
