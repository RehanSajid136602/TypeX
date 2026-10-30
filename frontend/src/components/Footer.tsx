"use client";

import React from "react";

interface FooterProps {
  isFocusMode: boolean;
}

export const Footer: React.FC<FooterProps> = ({ isFocusMode }) => {
  return (
    <footer
      className={`w-full max-w-5xl mx-auto px-6 py-6 flex items-center justify-between text-[11px] font-mono-custom text-[var(--footer-color)] transition-all duration-500 ease-out select-none ${
        isFocusMode ? "opacity-0 pointer-events-none translate-y-2" : "opacity-100 translate-y-0"
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="opacity-75 hover:opacity-100 hover:text-[var(--typed-color)] transition-colors">
          cpp-httplib
        </span>
        <span className="opacity-30">•</span>
        <span className="opacity-75 hover:opacity-100 hover:text-[var(--typed-color)] transition-colors">
          10k corpus
        </span>
      </div>

      <div className="flex items-center gap-2">
        <span className="opacity-75 hover:opacity-100 hover:text-[var(--typed-color)] transition-colors">
          typex v1.0.0
        </span>
        <span className="opacity-30">•</span>
        <span className="opacity-75 hover:opacity-100 hover:text-[var(--typed-color)] transition-colors">
          120fps
        </span>
      </div>
    </footer>
  );
};
