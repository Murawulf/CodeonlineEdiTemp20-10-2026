import React, { useState } from "react";
import { HelpCircle } from "lucide-react";

interface InfoTooltipProps {
  content: string;
  className?: string;
}

const InfoTooltip: React.FC<InfoTooltipProps> = ({ content, className = "" }) => {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <div className="relative inline-block">
      <button
        type="button"
        className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-blue-600 hover:text-blue-800 hover:bg-blue-100 transition-colors ${className}`}
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
        onClick={(e) => {
          e.preventDefault();
          setIsVisible(!isVisible);
        }}
        aria-label="Information"
      >
        <HelpCircle size={14} />
      </button>
      
      {isVisible && (
        <div className="absolute z-50 bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-max max-w-xs">
          <div className="bg-gray-900 text-white text-xs rounded-lg py-2 px-3 shadow-lg">
            {content}
            <div className="absolute top-full left-1/2 transform -translate-x-1/2 -mt-1">
              <div className="border-4 border-transparent border-t-gray-900"></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default InfoTooltip;
