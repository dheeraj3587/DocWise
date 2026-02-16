'use client'
import { FileText, Upload, Music, Video, Trash2 } from 'lucide-react';
import React, { useState } from 'react';
import { useUser } from '@clerk/clerk-react';
import { useApiQuery } from '@/lib/hooks';
import { deleteFile, FileRecord } from '@/lib/api-client';
import { Skeleton } from '@/components/ui/skeleton';
import Link from 'next/link';
import Header from '../components/header';
import { useAuth } from '@clerk/nextjs';

export default function Dashboard() {
  const { user } = useUser();
  const { getToken } = useAuth();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const email = user?.primaryEmailAddress?.emailAddress;
  const { data: getAllFiles, isLoading, refetch } = useApiQuery<FileRecord[]>(
    email ? `/api/files` : null,
    [email],
  );

  const handleDelete = async (e: React.MouseEvent, fileId: string, fileName: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`Delete "${fileName}"? This cannot be undone.`)) return;
    setDeletingId(fileId);
    try {
      const token = await getToken();
      await deleteFile(fileId, token);
      refetch();
    } catch (err) {
      console.error("Delete failed:", err);
      alert("Failed to delete file. Please try again.");
    } finally {
      setDeletingId(null);
    }
  };

  const getFileIcon = (fileType?: string) => {
    switch (fileType) {
      case 'audio': return <Music size={48} className="text-accent-foreground/80" />;
      case 'video': return <Video size={48} className="text-accent-foreground/70" />;
      default: return <FileText size={48} className="text-muted-foreground/40" />;
    }
  };

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <Header name="Dashboard" />

      <main className="flex-1 overflow-auto p-4 lg:p-8 custom-scrollbar">
        {isLoading ? (
          <div>
            <div className="mb-6">
              <Skeleton className="h-6 w-48 mb-2" />
              <Skeleton className="h-4 w-32" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((_, index) => (
                <div key={index} className="glass rounded-xl overflow-hidden">
                  <Skeleton className="h-40 w-full rounded-none" />
                  <div className="p-4">
                    <Skeleton className="h-5 w-3/4 mb-2" />
                    <Skeleton className="h-3 w-1/4" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : !getAllFiles || getAllFiles.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <div className="w-16 h-16 rounded-2xl glass flex items-center justify-center mb-4">
              <FileText size={32} className="text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">No documents yet</h3>
            <p className="text-sm text-muted-foreground">Upload a file to get started</p>
          </div>
        ) : (
          <div>
            <div className="mb-6">
              <h2 className="text-base font-semibold text-foreground">Recent Documents</h2>
              <p className="text-sm text-muted-foreground">You have {getAllFiles.length} document{getAllFiles.length !== 1 ? 's' : ''}</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {getAllFiles.map((pdf, index) => (
                <div
                  key={index}
                  className="glass rounded-xl hover:glow-gold-subtle transition-all overflow-hidden text-left group relative"
                >
                  <Link href={`/workspace/${pdf.fileId}`}>
                    <div className="h-40 surface-2 flex items-center justify-center border-b border-border group-hover:surface-3 transition-colors">
                      {getFileIcon(pdf.fileType)}
                    </div>
                    <div className="p-4">
                      <h3 className="font-medium text-foreground mb-2 truncate text-sm">
                        {pdf?.fileName}
                      </h3>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span className="uppercase px-1.5 py-0.5 surface-3 rounded text-[10px] font-medium">
                          {pdf.fileType}
                        </span>
                        {pdf.status === 'processing' && (
                          <span className="text-gold font-medium">Processing...</span>
                        )}
                      </div>
                    </div>
                  </Link>

                  <button
                    onClick={(e) => handleDelete(e, pdf.fileId, pdf.fileName)}
                    disabled={deletingId === pdf.fileId}
                    className="absolute top-2 right-2 p-1.5 rounded-lg glass opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive/10 hover:border-destructive/20 hover:text-destructive text-muted-foreground disabled:opacity-50"
                    title="Delete file"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
