import React, { useState, useCallback, useMemo } from 'react';
import { ImageUploader } from './components/ImageUploader';
import { Spinner } from './components/Spinner';
import { ImageResultCard } from './components/ImageResultCard';
import { analyzeImageAndSuggestMetadata } from './services/geminiService';
import { AppStatus, ImageMetadata, ImageFile } from './types';
import { LogoIcon, GithubIcon, HelpIcon, CloseIcon } from './components/IconComponents';

// External libraries loaded from script tags in index.html
declare const piexif: any;
declare const JSZip: any;

const toUcs2Bytes = (str: string): number[] => {
  const bytes = [];
  for (let i = 0; i < str.length; i++) {
      bytes.push(str.charCodeAt(i) & 0xff);
      bytes.push((str.charCodeAt(i) >> 8) & 0xff);
  }
  bytes.push(0, 0); // Null terminator
  return bytes;
};

const App: React.FC = () => {
  const [imageFiles, setImageFiles] = useState<ImageFile[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isZipping, setIsZipping] = useState(false);
  const [customTagsInput, setCustomTagsInput] = useState('');
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);

  const handleFileSelect = (selectedFiles: FileList) => {
    const newFiles: ImageFile[] = Array.from(selectedFiles)
      .filter(file => file.type.startsWith('image/'))
      .map(file => ({
        id: crypto.randomUUID(),
        file,
        previewUrl: URL.createObjectURL(file),
        metadata: null,
        status: AppStatus.IDLE,
        error: null,
      }));
    setImageFiles(prev => [...prev, ...newFiles]);
  };

  const updateImageFile = (id: string, updates: Partial<ImageFile>) => {
    setImageFiles(prev => prev.map(f => f.id === id ? { ...f, ...updates } : f));
  };

  const handleGenerateMetadataForOne = useCallback(async (id: string) => {
    const imageFile = imageFiles.find(f => f.id === id);
    if (!imageFile) return;

    updateImageFile(id, { status: AppStatus.LOADING, error: null });

    try {
      const metadata = await analyzeImageAndSuggestMetadata(imageFile.file);
      updateImageFile(id, { status: AppStatus.SUCCESS, metadata });
    } catch (err) {
      console.error(err);
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
      updateImageFile(id, { status: AppStatus.ERROR, error: errorMessage });
    }
  }, [imageFiles]);
  
  const handleGenerateAllMetadata = useCallback(async () => {
    setIsProcessing(true);
    for (const imageFile of imageFiles) {
        if (imageFile.status === AppStatus.IDLE || imageFile.status === AppStatus.ERROR) {
            await handleGenerateMetadataForOne(imageFile.id);
        }
    }
    setIsProcessing(false);
  }, [imageFiles, handleGenerateMetadataForOne]);

  const handleReset = () => {
    // Revoke all object URLs to prevent memory leaks
    imageFiles.forEach(f => URL.revokeObjectURL(f.previewUrl));
    setImageFiles([]);
  };
  
  const handleDeleteFile = (id: string) => {
    const fileToDelete = imageFiles.find(f => f.id === id);
    if (fileToDelete) {
      URL.revokeObjectURL(fileToDelete.previewUrl);
    }
    setImageFiles(prev => prev.filter(f => f.id !== id));
  };
  
  const handleMetadataChange = (id: string, newMetadata: ImageMetadata) => {
    updateImageFile(id, { metadata: newMetadata });
  };
  
  const handleApplyCustomTags = useCallback(() => {
    if (!customTagsInput.trim()) return;

    const newTags = customTagsInput.split(',').map(tag => tag.trim()).filter(Boolean);
    if (newTags.length === 0) return;

    setImageFiles(prevFiles =>
      prevFiles.map(file => {
        if (file.status === AppStatus.SUCCESS && file.metadata) {
          const combinedTags = new Set([...file.metadata.tags, ...newTags]);
          return {
            ...file,
            metadata: {
              ...file.metadata,
              tags: Array.from(combinedTags),
            },
          };
        }
        return file;
      })
    );

    setCustomTagsInput('');
  }, [customTagsInput]);
  
  const processAndDownloadAll = useCallback(async () => {
    if (typeof JSZip === 'undefined' || typeof piexif === 'undefined') {
        alert("A required library (JSZip or Piexif) failed to load. Cannot download files.");
        return;
    }
    
    setIsZipping(true);
    const zip = new JSZip();
    const filesToDownload = imageFiles.filter(f => f.status === AppStatus.SUCCESS && f.metadata);

    for (const imageFile of filesToDownload) {
        const { file, previewUrl, metadata } = imageFile;
        if (!metadata) continue;

        const newFilenameWithExt = `${metadata.filename}.jpg`;
        
        const imageDataUrl = await new Promise<string>((resolve, reject) => {
             // Convert all images to JPEG via canvas to ensure metadata can be embedded
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    ctx.drawImage(img, 0, 0);
                    resolve(canvas.toDataURL('image/jpeg', 0.95));
                } else {
                    reject(new Error("Failed to get canvas context."));
                }
            };
            img.onerror = () => reject(new Error("Could not load image for conversion."));
            img.src = previewUrl;
        });

        try {
            const zeroth = {
                [piexif.ImageIFD.ImageDescription]: metadata.description,
                [piexif.ImageIFD.XPTitle]: toUcs2Bytes(metadata.title),
                [piexif.ImageIFD.XPAuthor]: toUcs2Bytes("Game Art Assistant"),
                [piexif.ImageIFD.XPComment]: toUcs2Bytes(metadata.description),
                [piexif.ImageIFD.XPKeywords]: toUcs2Bytes(metadata.tags.join(';')),
            };
            const exifObj = { "0th": zeroth, "Exif": {}, "GPS": {} };
            const exifBytes = piexif.dump(exifObj);
            const newImageDataUrl = piexif.insert(exifBytes, imageDataUrl);
            
            // Convert data URL to blob for zipping
            const response = await fetch(newImageDataUrl);
            const blob = await response.blob();
            zip.file(newFilenameWithExt, blob);

        } catch (err) {
            console.error(`Failed to process and add file ${file.name} to zip:`, err);
            // Optionally add the original file to the zip on error
        }
    }

    try {
      const zipBlob = await zip.generateAsync({ type: "blob" });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(zipBlob);
      link.download = "game-art-metadata-batch.zip";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
    } catch(err) {
      console.error("Failed to generate zip file:", err);
      alert("An error occurred while creating the zip file.");
    } finally {
      setIsZipping(false);
    }
  }, [imageFiles]);

  const hasFiles = imageFiles.length > 0;
  const hasUnprocessedFiles = useMemo(() => imageFiles.some(f => f.status === AppStatus.IDLE || f.status === AppStatus.ERROR), [imageFiles]);
  const hasSuccessfulFiles = useMemo(() => imageFiles.some(f => f.status === AppStatus.SUCCESS), [imageFiles]);

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col items-center justify-start p-4 font-sans">
      <div className="w-full max-w-6xl mx-auto relative">
        <header className="text-center my-8">
          <div className="flex items-center justify-center gap-3 mb-2">
            <LogoIcon className="w-10 h-10 text-cyan-400" />
            <h1 className="text-4xl font-bold tracking-tight text-slate-50">Game Art Metadata Assistant</h1>
          </div>
          <p className="text-slate-400 max-w-3xl mx-auto">Analyze concept art and generate detailed, searchable metadata. Tag characters, environments, and props to easily find reference material for game production.</p>
        </header>

        <button 
          onClick={() => setIsHelpModalOpen(true)}
          className="absolute top-2 right-2 sm:top-4 sm:right-4 text-slate-400 hover:text-cyan-400 transition-colors p-2 rounded-full hover:bg-slate-800"
          aria-label="Open help menu"
        >
          <HelpIcon className="w-7 h-7" />
        </button>

        <main className="bg-slate-800/50 rounded-2xl shadow-2xl shadow-slate-950/50 border border-slate-700/50 p-6 sm:p-8 backdrop-blur-sm">
          {!hasFiles ? (
            <ImageUploader onFileSelect={handleFileSelect} />
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                {imageFiles.map(imageFile => (
                  <ImageResultCard
                    key={imageFile.id}
                    imageFile={imageFile}
                    onDelete={() => handleDeleteFile(imageFile.id)}
                    onMetadataChange={(newMetadata) => handleMetadataChange(imageFile.id, newMetadata)}
                    onRegenerate={() => handleGenerateMetadataForOne(imageFile.id)}
                  />
                ))}
              </div>

              <div className="mt-8 pt-6 border-t border-slate-700 space-y-6">
                {hasSuccessfulFiles && (
                  <div className="animate-fade-in">
                    <h3 className="text-lg font-semibold text-slate-200 mb-4">Bulk Actions</h3>
                    <div className="bg-slate-900/50 p-4 rounded-lg grid sm:grid-cols-3 items-end gap-4 border border-slate-700">
                      <div className="sm:col-span-2">
                        <label htmlFor="custom-tags-input" className="block text-sm font-medium text-slate-400 mb-1">Add Custom Tags to All</label>
                        <input
                          id="custom-tags-input"
                          type="text"
                          value={customTagsInput}
                          onChange={(e) => setCustomTagsInput(e.target.value)}
                          placeholder="e.g. project-x, level-1, characters"
                          className="w-full bg-slate-800 border border-slate-600 rounded-lg py-2.5 px-4 text-slate-50 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                        />
                      </div>
                      <button
                        onClick={handleApplyCustomTags}
                        disabled={!customTagsInput.trim()}
                        className="w-full h-fit bg-indigo-500 hover:bg-indigo-400 disabled:bg-slate-600 text-slate-50 font-bold py-3 px-4 rounded-lg transition-colors disabled:cursor-not-allowed"
                      >
                        Apply Tags
                      </button>
                    </div>
                  </div>
                )}

                <div className="flex flex-col sm:flex-row justify-between items-center gap-4 pt-6 border-t border-slate-700">
                  <button
                      onClick={handleReset}
                      className="text-slate-400 hover:text-red-400 transition-colors text-sm font-medium"
                    >
                      Clear All
                    </button>
                  <div className="flex flex-col sm:flex-row items-center gap-4">
                    <button
                      onClick={handleGenerateAllMetadata}
                      disabled={isProcessing || !hasUnprocessedFiles}
                      className="w-full sm:w-auto bg-cyan-500 hover:bg-cyan-400 disabled:bg-slate-600 text-slate-900 font-bold py-3 px-6 rounded-lg transition-transform transform hover:scale-105 disabled:cursor-not-allowed flex items-center justify-center"
                    >
                      {isProcessing ? <Spinner /> : 'Generate All'}
                    </button>
                    <button
                      onClick={processAndDownloadAll}
                      disabled={isZipping || !hasSuccessfulFiles}
                      className="w-full sm:w-auto bg-green-500 hover:bg-green-400 disabled:bg-slate-600 text-slate-900 font-bold py-3 px-6 rounded-lg transition-transform transform hover:scale-105 disabled:cursor-not-allowed flex items-center justify-center"
                    >
                      {isZipping ? <Spinner /> : 'Download All (.zip)'}
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </main>
      </div>

      <footer className="w-full text-center text-slate-500 text-sm mt-8 pb-4">
        <div className="inline-flex items-center gap-4">
            <p>Built with React, Gemini, and Tailwind CSS.</p>
            <a href="https://github.com/google/genai-js" target="_blank" rel="noopener noreferrer" className="hover:text-cyan-400 transition-colors">
                <GithubIcon className="w-6 h-6" />
            </a>
        </div>
      </footer>

      {isHelpModalOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 transition-opacity duration-300"
          onClick={() => setIsHelpModalOpen(false)}
        >
          <div 
            className="bg-slate-800 border border-slate-700 rounded-2xl shadow-xl w-full max-w-2xl p-6 sm:p-8 m-4 relative"
            onClick={(e) => e.stopPropagation()}
            style={{ animation: 'scale-in 0.2s ease-out forwards' }}
          >
            <button 
              onClick={() => setIsHelpModalOpen(false)} 
              className="absolute top-4 right-4 text-slate-500 hover:text-white transition-colors"
              aria-label="Close help menu"
            >
              <CloseIcon className="w-6 h-6" />
            </button>
            <h2 className="text-2xl font-bold text-slate-50 mb-6">Help & Information</h2>
            
            <div className="space-y-6 text-slate-300 max-h-[70vh] overflow-y-auto pr-4">
              <section>
                <h3 className="text-lg font-semibold text-cyan-400 mb-2">What It Does</h3>
                <p>This tool uses AI to analyze your game's concept art and automatically generate detailed, searchable metadata. The goal is to create a rich, internal art database, making it easy for your team to find specific character designs, environments, props, and other visual references during game production.</p>
              </section>

              <section>
                <h3 className="text-lg font-semibold text-cyan-400 mb-2">How to Use</h3>
                <ol className="list-decimal list-inside space-y-2">
                  <li><strong>Upload:</strong> Drag and drop your concept art images or click to select files.</li>
                  <li><strong>Generate:</strong> Click "Generate All" to have the AI analyze all images. It will identify key elements and create a descriptive filename, title, a detailed description, and a comprehensive list of tags.</li>
                  <li><strong>Review & Edit:</strong> Hover over any image to view and edit its metadata. You can refine the title, description, and tags to perfectly match your project's needs. All changes are saved automatically.</li>
                  <li><strong>Bulk Tag:</strong> Use the "Bulk Actions" section to add common project tags (like a project name, level, or character group) to all processed images at once.</li>
                  <li><strong>Download:</strong> Click "Download All (.zip)" to get a zip archive of your images. The new filenames and all metadata (title, description, tags) will be embedded directly into the image files' EXIF data for use in other asset management tools.</li>
                </ol>
              </section>

              <section>
                <h3 className="text-lg font-semibold text-cyan-400 mb-2">Contact</h3>
                <p>For questions or feedback, please contact:</p>
                <a href="mailto:graysonchalmers@gmail.com" className="text-cyan-400 hover:underline">Grayson Chalmers - graysonchalmers@gmail.com</a>
              </section>
            </div>
          </div>
        </div>
      )}
      <style>{`
        @keyframes scale-in {
          from { transform: scale(0.95); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
};

export default App;