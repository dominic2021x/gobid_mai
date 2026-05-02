"use client";

import React from "react";

export default function KanbanBoardPage() {
  return (
    <div className="p-5">
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm p-6">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Kanban Board</h1>
            <p className="text-gray-600 dark:text-gray-400">Tablou Kanban pentru gestionarea task-urilor.</p>
            
            <div className="mt-6 bg-gray-100 dark:bg-gray-700 rounded-lg p-8 text-center">
              <div className="text-4xl mb-4">📋</div>
              <p className="text-gray-500 dark:text-gray-400">Kanban board component will be available soon</p>
            </div>
          </div>
    </div>
  );
}
