import React, { useState, useEffect } from 'react';
import { ImageFile, ImageMetadata, AppStatus } from '../types';
import { CopyIcon, CheckIcon, RegenerateIcon, TrashIcon } from './IconComponents';
import { Spinner } from './Spinner';


interface ImageResultCardProps {
  imageFile: ImageFile;
  onDelete: () => void;
  onMetadataChange: (newMetadata: ImageMetadata) => void;
  onRegenerate: () => void;
}

export const ImageResultCard: React.FC<ImageResultCardProps> = ({ imageFile, onDelete, onMetadataChange, onRegenerate }) => {
  const [copied, setCopied] = useState(false);
  const { id, previewUrl, status, metadata, error, file } = imageFile;

  useEffect(() => {
    setCopied(false);
  }, [metadata]);
  
  const handleCopy = () => {
    if (!metadata) return;
    navigator.clipboard.writeText(`${metadata.filename}.jpg`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (!metadata) return;
    onMetadataChange({
      ...metadata,
      [e.target.name]: e.target.value,
    });
  };

  const handleTagsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!metadata) return;
    onMetadataChange({
        ...metadata,
        tags: e.target.value.split(',').map(tag => tag.trim()).filter(Boolean),
    });
  };
  
  const renderContent = () => {
    switch (status) {
        case AppStatus.LOADING:
            return (
                <div className="absolute inset-0 bg-slate-900/80 flex flex-col items-center justify-center p-4 rounded-lg">
                  <Spinner />
                  <p className="mt-2 text-slate-400 text-sm">Analyzing...</p>
                </div>
            );
        case AppStatus.SUCCESS:
            if (!metadata) return null;
            return (
              <div className="absolute inset-0 bg-slate-900/95 p-4 rounded-lg opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity overflow-y-auto">
                <div className="w-full space-y-3">
                    <div className="w-full text-left">
                        <label htmlFor={`filename-${id}`} className="block text-xs font-medium text-slate-400 mb-1">Filename</label>
                        <div className="relative">
                            <input id={`filename-${id}`} name="filename" type="text" value={metadata.filename} onChange={handleInputChange} className="w-full bg-slate-800 border border-slate-700 rounded-md py-1.5 pl-2 pr-16 text-slate-50 text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500"/>
                            <span className="absolute inset-y-0 right-8 flex items-center pr-2 text-slate-500 text-xs pointer-events-none">.jpg</span>
                            <button onClick={handleCopy} className="absolute inset-y-0 right-0 flex items-center px-2 text-slate-400 hover:text-cyan-400 transition-colors" aria-label="Copy filename">
                                {copied ? <CheckIcon className="w-4 h-4 text-green-400" /> : <CopyIcon className="w-4 h-4" />}
                            </button>
                        </div>
                    </div>
                    <div className="w-full text-left">
                        <label htmlFor={`title-${id}`} className="block text-xs font-medium text-slate-400 mb-1">Title</label>
                        <input id={`title-${id}`} name="title" type="text" value={metadata.title} onChange={handleInputChange} className="w-full bg-slate-800 border border-slate-700 rounded-md py-1.5 px-2 text-slate-50 text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500" />
                    </div>
                    <div className="w-full text-left">
                        <label htmlFor={`description-${id}`} className="block text-xs font-medium text-slate-400 mb-1">Description</label>
                        <textarea id={`description-${id}`} name="description" value={metadata.description} onChange={handleInputChange} rows={3} className="w-full bg-slate-800 border border-slate-700 rounded-md py-1.5 px-2 text-slate-50 text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500 resize-none" />
                    </div>
                    <div className="w-full text-left">
                        <label htmlFor={`tags-${id}`} className="block text-xs font-medium text-slate-400 mb-1">Tags</label>
                        <input id={`tags-${id}`} name="tags" type="text" value={metadata.tags.join(', ')} onChange={handleTagsChange} className="w-full bg-slate-800 border border-slate-700 rounded-md py-1.5 px-2 text-slate-50 text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500"/>
                    </div>
                </div>
                <button onClick={onRegenerate} className="absolute bottom-3 left-3 flex items-center justify-center gap-1 text-slate-400 hover:text-cyan-400 transition-colors text-xs font-medium">
                    <RegenerateIcon className="w-3 h-3" />
                    Regenerate
                </button>
              </div>
            );
        case AppStatus.ERROR:
             return (
                 <div className="absolute inset-0 bg-red-900/90 flex flex-col items-center justify-center text-center p-2 rounded-lg">
                   <p className="text-sm font-semibold text-red-200">Analysis Failed</p>
                   <p className="text-xs text-red-300 mb-2 truncate">{error}</p>
                   <button onClick={onRegenerate} className="bg-red-600 hover:bg-red-500 text-white font-bold py-1 px-3 rounded-md transition-colors text-sm">
                     Try Again
                   </button>
                 </div>
              );
        default:
            return null;
    }
  }

  return (
    <div className="relative aspect-square w-full bg-slate-900 rounded-lg shadow-md group animate-fade-in">
      <img src={previewUrl} alt={file.name} className="w-full h-full object-cover rounded-lg" />
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2 rounded-b-lg">
          <p className="text-xs text-white truncate font-mono">{file.name}</p>
      </div>
      <button 
        onClick={onDelete}
        className="absolute top-1.5 right-1.5 bg-slate-900/60 hover:bg-red-600/80 text-white rounded-full p-1 transition-all duration-200 opacity-0 group-hover:opacity-100 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-red-400"
        aria-label="Remove image"
      >
        <TrashIcon className="h-4 w-4" />
      </button>
      {renderContent()}
    </div>
  );
};