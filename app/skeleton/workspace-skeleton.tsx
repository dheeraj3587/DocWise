import React from 'react';
import { Skeleton } from '@/components/ui/skeleton';

export const WorkspaceSkeleton = () => {
    return (
        <div className="flex flex-col h-screen bg-mesh">
            {/* Header Skeleton */}
            <div className="border-b border-border glass-subtle p-4">
                <div className="flex-between">
                    <div className="flex items-center gap-3">
                        <Skeleton className="h-8 w-8 rounded-xl" />
                        <Skeleton className="h-6 w-48" />
                    </div>
                    <div className="flex items-center gap-2">
                        <Skeleton className="h-9 w-24 rounded-xl" />
                        <Skeleton className="h-9 w-24 rounded-xl" />
                    </div>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 overflow-hidden p-4">
                <div className="flex h-full gap-2">
                    <div className="flex-1 flex flex-col gap-3 glass rounded-xl p-4">
                        <Skeleton className="h-8 w-3/4" />
                        <div className="space-y-2">
                            <Skeleton className="h-4 w-full" />
                            <Skeleton className="h-4 w-full" />
                            <Skeleton className="h-4 w-5/6" />
                            <Skeleton className="h-4 w-full" />
                            <Skeleton className="h-4 w-4/5" />
                        </div>
                        <div className="space-y-2 mt-4">
                            <Skeleton className="h-4 w-full" />
                            <Skeleton className="h-4 w-full" />
                            <Skeleton className="h-4 w-3/4" />
                        </div>
                    </div>

                    <div className="w-2 cursor-col-resize" />

                    <div className="flex-1 glass rounded-xl p-4">
                        <div className="flex flex-col h-full gap-4">
                            <div className="flex-between border-b border-border pb-3">
                                <div className="flex gap-2">
                                    <Skeleton className="h-8 w-8 rounded-lg" />
                                    <Skeleton className="h-8 w-8 rounded-lg" />
                                </div>
                                <Skeleton className="h-8 w-32 rounded-lg" />
                                <div className="flex gap-2">
                                    <Skeleton className="h-8 w-8 rounded-lg" />
                                    <Skeleton className="h-8 w-8 rounded-lg" />
                                </div>
                            </div>
                            <div className="flex-1 surface-2 rounded-xl flex-center">
                                <div className="space-y-4 w-full max-w-2xl px-8">
                                    <Skeleton className="h-64 w-full rounded-xl" />
                                    <Skeleton className="h-4 w-3/4 mx-auto" />
                                    <Skeleton className="h-4 w-2/3 mx-auto" />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
