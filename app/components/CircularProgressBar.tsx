import React, { useEffect, useState } from 'react';

interface CircularProgressBarProps {
  progress: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
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
  const progressColor =
    progress >= 80
      ? 'stroke-green-500'
      : progress >= 60
      ? 'stroke-yellow-500'
      : 'stroke-red-500';

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90 transform">
        <circle
          className={`${trackColor} transition-all duration-300`}
          strokeWidth={strokeWidth}
          stroke="currentColor"
          fill="transparent"
          r={radius}
          cx={size / 2}
          cy={size / 2}
        />
        <circle
          className={`${progressColor} transition-all duration-1000 ease-out`}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          stroke="currentColor"
          fill="transparent"
          r={radius}
          cx={size / 2}
          cy={size / 2}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-4xl font-bold ${scoreColor} transition-colors duration-300`}>
          {Math.round(animatedProgress)}%
        </span>
        <span className={`text-sm font-medium ${dark ? 'text-slate-400' : 'text-gray-500'}`}>
          التوافق
        </span>
      </div>
    </div>
  );
};

export default CircularProgressBar; 