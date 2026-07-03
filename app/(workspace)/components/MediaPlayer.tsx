'use client'

import { useRef, useCallback, useState, useEffect } from 'react'
import { Play, Pause, Volume2, VolumeX, SkipForward, SkipBack } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Timestamp {
    id?: number
    start_time: number
    end_time: number
    text: string
    topic?: string
}

interface MediaPlayerProps {
    fileUrl: string
    fileType: 'audio' | 'video'
    timestamps?: Timestamp[]
}

const EMPTY_TIMESTAMPS: Timestamp[] = []

export const MediaPlayer = ({ fileUrl, fileType, timestamps = EMPTY_TIMESTAMPS }: MediaPlayerProps) => {
    const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement>(null)
    const [isPlaying, setIsPlaying] = useState(false)
    const [currentTime, setCurrentTime] = useState(0)
    const [duration, setDuration] = useState(0)
    const [isMuted, setIsMuted] = useState(false)
    const [activeTimestamp, setActiveTimestamp] = useState<number | null>(null)

    const seekTo = useCallback((seconds: number) => {
        if (mediaRef.current) {
            mediaRef.current.currentTime = seconds
            mediaRef.current.play()
            setIsPlaying(true)
        }
    }, [])

    const togglePlay = useCallback(() => {
        if (mediaRef.current) {
            if (isPlaying) {
                mediaRef.current.pause()
            } else {
                mediaRef.current.play()
            }
            setIsPlaying(!isPlaying)
        }
    }, [isPlaying])

    const toggleMute = useCallback(() => {
        if (mediaRef.current) {
            mediaRef.current.muted = !isMuted
            setIsMuted(!isMuted)
        }
    }, [isMuted])

    const skip = useCallback((seconds: number) => {
        if (mediaRef.current) {
            mediaRef.current.currentTime = Math.max(0, mediaRef.current.currentTime + seconds)
        }
    }, [])

    useEffect(() => {
        const media = mediaRef.current
        if (!media) return

        const onTimeUpdate = () => {
            setCurrentTime(media.currentTime)
            const active = timestamps.findIndex(
                ts => media.currentTime >= ts.start_time && media.currentTime <= ts.end_time
            )
            setActiveTimestamp(active >= 0 ? active : null)
        }

        const onLoadedMetadata = () => setDuration(media.duration)
        const onEnded = () => setIsPlaying(false)

        media.addEventListener('timeupdate', onTimeUpdate)
        media.addEventListener('loadedmetadata', onLoadedMetadata)
        media.addEventListener('ended', onEnded)

        return () => {
            media.removeEventListener('timeupdate', onTimeUpdate)
            media.removeEventListener('loadedmetadata', onLoadedMetadata)
            media.removeEventListener('ended', onEnded)
        }
    }, [timestamps])

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60)
        const secs = Math.floor(seconds % 60)
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    }

    const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0

    return (
        <div className="flex h-full flex-col overflow-hidden bg-background">
            {/* Media Element */}
            <div className="shrink-0 bg-card/70 flex-center">
                {fileType === 'video' ? (
                    <video
                        ref={mediaRef as React.RefObject<HTMLVideoElement>}
                        src={fileUrl}
                        className="w-full max-h-[50vh] object-contain"
                        preload="metadata"
                    />
                ) : (
                    <div className="w-full bg-secondary/40 py-16 flex-center">
                        <div className="grid h-16 w-16 place-items-center rounded-lg border border-border bg-background text-muted-foreground">
                            <Volume2 className="h-7 w-7" strokeWidth={1.75} />
                        </div>
                        <audio
                            ref={mediaRef as React.RefObject<HTMLAudioElement>}
                            src={fileUrl}
                            preload="metadata"
                        />
                    </div>
                )}
            </div>

            {/* Controls */}
            <div className="shrink-0 p-4 border-b border-border">
                <button
                    type="button"
                    aria-label="Seek media"
                    className="w-full h-2 surface-3 rounded-full cursor-pointer mb-3 overflow-hidden block"
                    onClick={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect()
                        const pos = (e.clientX - rect.left) / rect.width
                        seekTo(pos * duration)
                    }}
                >
                    <div
                        className="h-full rounded-full bg-foreground transition-all duration-100"
                        style={{ width: `${progressPercent}%` }}
                    />
                </button>

                <div className="flex-between">
                    <div className="flex items-center gap-1">
                        <Button aria-label="Skip back 10 seconds" variant="ghost" size="sm" onClick={() => skip(-10)} className="text-muted-foreground hover:text-foreground">
                            <SkipBack size={16} />
                        </Button>
                        <Button aria-label={isPlaying ? "Pause media" : "Play media"} variant="ghost" size="sm" onClick={togglePlay} className="text-foreground">
                            {isPlaying ? <Pause size={20} /> : <Play size={20} />}
                        </Button>
                        <Button aria-label="Skip forward 10 seconds" variant="ghost" size="sm" onClick={() => skip(10)} className="text-muted-foreground hover:text-foreground">
                            <SkipForward size={16} />
                        </Button>
                        <Button aria-label={isMuted ? "Unmute media" : "Mute media"} variant="ghost" size="sm" onClick={toggleMute} className="text-muted-foreground hover:text-foreground">
                            {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                        </Button>
                    </div>
                    <span className="text-sm text-muted-foreground font-mono">
                        {formatTime(currentTime)} / {formatTime(duration)}
                    </span>
                </div>
            </div>

            {/* Timestamps */}
            {timestamps.length > 0 && (
                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                    <h3 className="text-sm font-semibold text-muted-foreground mb-3">Topics &amp; Timestamps</h3>
                    <div className="space-y-2">
                        {timestamps.map((ts, index) => (
                            <button
                                key={ts.id || index}
                                type="button"
                                onClick={() => seekTo(ts.start_time)}
                                className={`w-full rounded-lg border p-3 text-left transition-colors ${activeTimestamp === index
                                    ? 'bg-secondary border-border text-foreground'
                                    : 'bg-background border-border text-muted-foreground hover:bg-secondary/70 hover:text-foreground'
                                    }`}
                            >
                                <div className="flex items-center gap-3">
                                    <span className="whitespace-nowrap rounded border border-border bg-secondary px-2 py-1 font-mono text-xs text-muted-foreground">
                                        {formatTime(ts.start_time)}
                                    </span>
                                    <div className="flex-1 min-w-0">
                                        {ts.topic && (
                                            <p className="text-sm font-medium text-foreground truncate">
                                                {ts.topic}
                                            </p>
                                        )}
                                        <p className="text-xs text-muted-foreground truncate">{ts.text}</p>
                                    </div>
                                    <Play size={14} className="text-muted-foreground shrink-0" />
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}
