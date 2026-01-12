import React from "react";
import { EnhancedHeader } from "../groups/EnhancedHeader";

export type AttendeeStage = "intro" | "groups" | "rounds" | "finished";

interface SlideShellProps {
  stage: AttendeeStage;
  headerProps: {
    timeRemaining: number;
    participantName?: string;
    participantNumber?: number | null;
    tableNumber?: number | null;
    groupMembers?: string[];
    currentGame?: string;
    onGoHome?: () => void;
    onShowHelp?: () => void;
  };
  children: React.ReactNode;
}

export function SlideShell({ stage, headerProps, children }: SlideShellProps) {
  return (
    <div className="fixed inset-0 z-[60] bg-slate-950/90 backdrop-blur-md">
      <EnhancedHeader {...headerProps} />
      <div className="max-w-md mx-auto px-4 pt-4 pb-8">
        <div className="relative overflow-hidden">
          {/* keyed container to trigger CSS transition on stage change */}
          <StageWrapper key={stage}>{children}</StageWrapper>
        </div>
      </div>
    </div>
  );
}

function StageWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="animate-slide-fade-in">
      {children}
      <style>{`
        @keyframes slideFadeIn {
          0% { opacity: 0; transform: translateY(12px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        .animate-slide-fade-in { animation: slideFadeIn 300ms ease forwards; }
      `}</style>
    </div>
  );
}
