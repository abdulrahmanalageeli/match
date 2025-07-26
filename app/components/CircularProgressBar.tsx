import React, { useEffect, useState } from 'react';

interface CircularProgressBarProps {
  progress: number;
  size?: number;
  strokeWidth?: number;
  dark?: boolean;
}

const CircularProgressBar: React.FC<CircularProgressBarProps> = ({
  progress,
  size = 150,
  strokeWidth = 15,
  dark = true,
}) => {
  const [animatedProgress, setAnimatedProgress] = useState(0);

  useEffect(() => {
    // Animate progress on change
    const animation = requestAnimationFrame(() => setAnimatedProgress(progress));
    return () => cancelAnimationFrame(animation);
  }, [progress]);

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (animatedProgress / 100) * circumference;

  const scoreColor =
    progress >= 80
      ? 'text-green-400'
      : progress >= 60
      ? 'text-yellow-400'
      : 'text-red-400';

  const trackColor = dark ? 'stroke-slate-700' : 'stroke-gray-200';
  
  const gradientId = progress >= 80 ? 'green-gradient' : progress >= 60 ? 'yellow-gradient' : 'red-gradient';

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90 transform">
        <defs>
          <linearGradient id="green-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#10b981" />
            <stop offset="100%" stopColor="#6ee7b7" />
          </linearGradient>
          <linearGradient id="yellow-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#facc15" />
          </linearGradient>
          <linearGradient id="red-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#ef4444" />
            <stop offset="100%" stopColor="#f87171" />
          </linearGradient>
        </defs>
        <circle
          className={trackColor}
          strokeWidth={strokeWidth}
          stroke="currentColor"
          fill="transparent"
          r={radius}
          cx={size / 2}
          cy={size / 2}
        />
        <circle
          stroke={`url(#${gradientId})`}
          className="transition-all duration-1000 ease-out"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          fill="transparent"
          r={radius}
          cx={size / 2}
          cy={size / 2}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-center">
          <span className={`text-4xl font-bold ${scoreColor} transition-colors duration-300`}>
            {Math.round(animatedProgress)}%
          </span>
          <span className={`block text-sm font-medium ${dark ? 'text-slate-400' : 'text-gray-500'}`}>
            التوافق
          </span>
        </div>
      </div>
    </div>
  );
};

export default CircularProgressBar; 