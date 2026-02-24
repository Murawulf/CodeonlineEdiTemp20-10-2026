import React from "react";

const GlobalLoader: React.FC<{ text?: string }> = ({ text = "Chargement..." }) => {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/30">
      <div className="flex flex-col items-center gap-4">
        <div className="relative">
          <span className="absolute -inset-2 rounded-full animate-ping" />
          <div className="w-20 h-20 rounded-full bg-blue-950 flex items-center justify-center">
            <svg
              className="w-14 h-14 animate-spin"
              viewBox="0 0 50 50"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <circle cx="25" cy="25" r="20" stroke="white" strokeOpacity="0.12" strokeWidth="5" />
              <path
                d="M45 25a20 20 0 00-6.1-14.1"
                stroke="white"
                strokeWidth="5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </div>
        <div className="text-white font-medium text-sm select-none">{text}</div>
      </div>
    </div>
  );
};

export default GlobalLoader;
