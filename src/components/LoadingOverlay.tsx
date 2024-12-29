import React from 'react';

export const LoadingOverlay: React.FC = () => (
  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
    <div className="bg-white rounded-lg p-6 text-center">
      <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent mx-auto mb-4"></div>
      <p className="text-gray-600">Analyzing image...</p>
    </div>
  </div>
);