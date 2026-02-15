'use client'

import { Button } from "@/components/ui/button"
import { useEffect, useState } from "react"

import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getUploadCount, uploadFile } from "@/lib/api-client"
import { useAuth } from "@clerk/nextjs"
import { Loader2 } from "lucide-react"

export function FileUpload({ children }: { children: React.ReactNode }) {
    const { getToken } = useAuth();
    const [file, setFile] = useState<File | null>(null);
    const [name, setName] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [open, setOpen] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [remaining, setRemaining] = useState<number | null>(null);
    const [dailyLimit, setDailyLimit] = useState<number>(5);

    // Fetch upload count when dialog opens
    useEffect(() => {
        if (!open) return;
        (async () => {
            try {
                const token = await getToken();
                const data = await getUploadCount(token);
                setRemaining(data.remaining);
                setDailyLimit(data.limit);
            } catch {
                // Fallback — allow upload
                setRemaining(null);
            }
        })();
    }, [open, getToken]);

    const onFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        setError(null)
        setFile(e.target.files![0])
    }

    const onUpload = async () => {
        if (!file) return;
        if (remaining !== null && remaining <= 0) {
            setError(`Daily upload limit reached (${dailyLimit} files/day). Try again tomorrow.`);
            return;
        }
        setLoading(true);
        try {
            const token = await getToken();
            await uploadFile(
                file,
                name ?? "untitled file",
                token,
            );
            setLoading(false);
            setOpen(false);
            window.location.reload();
        } catch (error: any) {
            console.error("Upload error:", error);
            const msg = error?.message || "";
            if (msg.includes("429") || msg.toLowerCase().includes("daily upload limit")) {
                setError(`Daily upload limit reached (${dailyLimit} files/day). Try again tomorrow.`);
            } else {
                setError("Upload failed. Please try again.");
            }
            setLoading(false);
        }
    }
    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <form>
                <DialogTrigger asChild>
                    {children}
                </DialogTrigger>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>Upload File</DialogTitle>
                        <DialogDescription>
                            Upload a PDF, audio, or video file. Click save when you&apos;re
                            done.
                        </DialogDescription>
                        {remaining !== null && (
                            <p className={`text-xs mt-1 ${remaining === 0 ? 'text-red-600 font-medium' : 'text-slate-500'}`}>
                                {remaining === 0
                                    ? `Daily upload limit reached (${dailyLimit}/${dailyLimit})`
                                    : `${remaining} upload${remaining !== 1 ? 's' : ''} remaining today (${dailyLimit - remaining}/${dailyLimit})`}
                            </p>
                        )}
                    </DialogHeader>
                    <div className="grid gap-4">
                        <div
                            onDragOver={(e) => { e.preventDefault(); }}
                            onDrop={(e) => {
                                e.preventDefault();
                                setError(null)
                                const f = e.dataTransfer.files?.[0];
                                if (f) setFile(f);
                            }}
                            className="border-2 border-dashed border-slate-300 rounded-md p-4 text-center text-sm text-slate-600"
                        >
                            {file ? (
                                <span>{file.name}</span>
                            ) : (
                                <span>Drag & drop a PDF, audio or video here</span>
                            )}
                        </div>
                        <div className="grid gap-3">
                            <Label htmlFor="file-1">File</Label>
                            <Input onChange={onFileSelect} placeholder="Upload file" id="file-1" name="file" type="file" accept=".pdf,audio/*,video/*" />
                        </div>
                        <div className="grid gap-3">
                            <Label htmlFor="name-1">File name</Label>
                            <Input onChange={(e) => setName(e.target.value)} placeholder="Enter file name" id="name-1" name="name" />
                        </div>
                        {error && <p className="text-sm text-red-600">{error}</p>}
                    </div>
                    <DialogFooter>
                        <DialogClose asChild>
                            <Button variant="outline">Cancel</Button>
                        </DialogClose>
                        <Button disabled={loading || (remaining !== null && remaining <= 0)} onClick={onUpload} type="submit">
                            {loading ? <Loader2
                                className="flex justify-center items-center mr-2 h-4 w-4 animate-spin"
                            /> : 'Save'}</Button>
                    </DialogFooter>
                </DialogContent>
            </form>
        </Dialog>
    )
}
