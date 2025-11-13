import React from 'react';
import { X, Sparkles } from 'lucide-react';

interface AIAnalysisModalProps {
  analysis: string;
  isOpen: boolean;
  onClose: () => void;
}

export default function AIAnalysisModal({ analysis, isOpen, onClose }: AIAnalysisModalProps) {
  if (!isOpen) return null;
  
  // Add debugging to check the content
  console.log('AIAnalysisModal - Analysis length:', analysis?.length || 0);
  console.log('AIAnalysisModal - First 100 chars:', analysis?.substring(0, 100) || 'Empty');
  
  // Check if the analysis is valid
  const hasValidAnalysis = analysis && analysis.trim().length > 0;

  // Function to render markdown content
  const renderMarkdown = (content: string) => {
    return content.split('\n').map((line: string, i: number) => {
      // Handle headers
      if (line.startsWith('# ')) {
        return <h1 key={i} className="text-2xl font-bold text-purple-200 mt-4 mb-2">{line.substring(2)}</h1>;
      } else if (line.startsWith('## ')) {
        return <h2 key={i} className="text-xl font-bold text-purple-300 mt-3 mb-2">{line.substring(3)}</h2>;
      } else if (line.startsWith('### ')) {
        return <h3 key={i} className="text-lg font-bold text-purple-400 mt-2 mb-1">{line.substring(4)}</h3>;
      } else if (line.startsWith('- ')) {
        // Handle bullet points with formatting
        const content = line.substring(2);
        const processedContent = content
          .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>') // Bold
          .replace(/\*([^*]+)\*/g, '<em>$1</em>'); // Italic
        
        return <div key={i} className="flex mb-1"><span className="mr-2">•</span><span dangerouslySetInnerHTML={{ __html: processedContent }} /></div>;
      } else if (line.startsWith('1. ') || line.startsWith('2. ') || line.startsWith('3. ') || line.startsWith('4. ') || line.startsWith('5. ')) {
        // Handle numbered lists with formatting
        const num = line.substring(0, line.indexOf('.') + 1);
        const content = line.substring(line.indexOf('.') + 2);
        const processedContent = content
          .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>') // Bold
          .replace(/\*([^*]+)\*/g, '<em>$1</em>'); // Italic
        
        return <div key={i} className="flex mb-1"><span className="mr-2 font-bold">{num}</span><span dangerouslySetInnerHTML={{ __html: processedContent }} /></div>;
      } else if (line.trim() === '') {
        // Handle empty lines
        return <div key={i} className="h-2"></div>;
      } else {
        // Regular paragraph with bold and italic formatting
        const processedLine = line
          .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>') // Bold
          .replace(/\*([^*]+)\*/g, '<em>$1</em>'); // Italic
        
        return <p key={i} className="mb-2" dangerouslySetInnerHTML={{ __html: processedLine }} />;
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70">
      <div className="bg-slate-900 border border-purple-500/30 rounded-lg w-[90%] max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <Sparkles className="text-purple-300 w-6 h-6" />
            <h2 className="text-xl font-bold text-purple-200">AI Analysis of Matching Algorithm</h2>
          </div>
          <button 
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors"
          >
            <X size={24} />
          </button>
        </div>
        
        {/* Content */}
        <div className="overflow-y-auto p-6 prose prose-invert max-w-none prose-p:text-slate-300 prose-headings:text-purple-300 prose-strong:text-white">
          {hasValidAnalysis ? (
            (() => {
              try {
                return renderMarkdown(analysis);
              } catch (error) {
                console.error('Error rendering markdown:', error);
                return (
                  <div className="text-center py-10">
                    <p className="text-red-400 mb-4">Error rendering analysis content.</p>
                    <p className="text-slate-400">Check the console for more details.</p>
                    <pre className="mt-4 p-4 bg-slate-800 rounded text-left overflow-auto max-h-80 text-xs">
                      {error instanceof Error ? error.message : 'Unknown error'}
                    </pre>
                  </div>
                );
              }
            })()
          ) : (
            <div className="text-center py-10">
              <p className="text-red-400 mb-4">No analysis content available.</p>
              <p className="text-slate-400">Try running the analysis again or check the console for errors.</p>
            </div>
          )}
        </div>
        
        {/* Footer */}
        <div className="border-t border-slate-700 p-4 flex justify-end">
          <button 
            onClick={onClose}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-md transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
