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
    seekToTime?: number | null
}

const EMPTY_TIMESTAMPS: Timestamp[] = []

export const MediaPlayer = ({ fileUrl, fileType, timestamps = EMPTY_TIMESTAMPS, seekToTime }: MediaPlayerProps) => {
    const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement>(null)
    const [isPlaying, setIsPlaying] = useState(false)
    const [currentTime, setCurrentTime] = useState(0)
    const [duration, setDuration] = useState(0)
    const [isMuted, setIsMuted] = useState(false)
    const [activeTimestamp, setActiveTimestamp] = useState<number | null>(null)

    /** Move the playhead without starting playback. Safe against NaN duration. */
    const scrubTo = useCallback((seconds: number) => {
        const media = mediaRef.current
        if (!media || !Number.isFinite(seconds)) return
        const limit = Number.isFinite(media.duration) ? media.duration : Infinity
        media.currentTime = Math.max(0, Math.min(seconds, limit))
        setCurrentTime(media.currentTime)
    }, [])

    const seekTo = useCallback((seconds: number) => {
        const media = mediaRef.current
        if (!media || !Number.isFinite(seconds)) return
        scrubTo(seconds)
        // play() rejects when autoplay policy blocks it — an unhandled rejection
        // here left the button showing "pause" over silent media.
        void media.play().then(
            () => setIsPlaying(true),
            () => setIsPlaying(false),
        )
    }, [scrubTo])

    useEffect(() => {
        if (seekToTime == null) return
        seekTo(seekToTime)
    }, [seekToTime, seekTo])

    const togglePlay = useCallback(() => {
        const media = mediaRef.current
        if (!media) return
        if (isPlaying) {
            media.pause()
            setIsPlaying(false)
            return
        }
        void media.play().then(
            () => setIsPlaying(true),
            () => setIsPlaying(false),
        )
    }, [isPlaying])

    const toggleMute = useCallback(() => {
        if (mediaRef.current) {
            mediaRef.current.muted = !isMuted
            setIsMuted(!isMuted)
        }
    }, [isMuted])

    const skip = useCallback((seconds: number) => {
        const media = mediaRef.current
        if (!media) return
        scrubTo(media.currentTime + seconds)
    }, [scrubTo])

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

        // Live streams report Infinity and unloaded media reports NaN.
        const onLoadedMetadata = () =>
            setDuration(Number.isFinite(media.duration) ? media.duration : 0)
        const onEnded = () => setIsPlaying(false)
        // Native controls (video) and autoplay blocks change playback without
        // going through our buttons, so mirror the element rather than guess.
        const onPlay = () => setIsPlaying(true)
        const onPause = () => setIsPlaying(false)

        media.addEventListener('timeupdate', onTimeUpdate)
        media.addEventListener('loadedmetadata', onLoadedMetadata)
        media.addEventListener('durationchange', onLoadedMetadata)
        media.addEventListener('ended', onEnded)
        media.addEventListener('play', onPlay)
        media.addEventListener('pause', onPause)

        return () => {
            media.removeEventListener('timeupdate', onTimeUpdate)
            media.removeEventListener('loadedmetadata', onLoadedMetadata)
            media.removeEventListener('durationchange', onLoadedMetadata)
            media.removeEventListener('ended', onEnded)
            media.removeEventListener('play', onPlay)
            media.removeEventListener('pause', onPause)
        }
    }, [timestamps])

    const formatTime = (seconds: number) => {
        if (!Number.isFinite(seconds) || seconds < 0) return '--:--'
        const mins = Math.floor(seconds / 60)
        const secs = Math.floor(seconds % 60)
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    }

    const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0

    return (
        <div className="flex h-full flex-col overflow-hidden bg-background">
            {/* Media Element */}
            <div className="flex shrink-0 items-center justify-center bg-stage">
                {fileType === 'video' ? (
                    <video
                        ref={mediaRef as React.RefObject<HTMLVideoElement>}
                        src={fileUrl}
                        className="max-h-[50vh] w-full object-contain"
                        preload="metadata"
                    />
                ) : (
                    <div className="flex w-full items-center justify-center py-16">
                        <div className="grid size-16 place-items-center rounded-lg border border-border bg-card text-muted-foreground">
                            <Volume2 className="size-7" strokeWidth={1.75} />
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
                {/* A real range input so the scrubber is draggable and reachable
                    by keyboard; the meter below is purely the visual. */}
                <div className="relative mb-3 flex h-4 items-center">
                    <div className="docwise-meter pointer-events-none absolute inset-x-0">
                        <div
                            className="docwise-meter-fill transition-none"
                            style={{ width: `${progressPercent}%` }}
                        />
                    </div>
                    <input
                        type="range"
                        min={0}
                        max={duration || 0}
                        step={0.1}
                        value={Math.min(currentTime, duration || 0)}
                        disabled={!duration}
                        aria-label="Seek media"
                        aria-valuetext={`${formatTime(currentTime)} of ${formatTime(duration)}`}
                        onChange={(e) => scrubTo(Number(e.target.value))}
                        className="relative h-4 w-full cursor-pointer appearance-none bg-transparent outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed [&::-moz-range-thumb]:size-3 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-foreground [&::-webkit-slider-thumb]:size-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-foreground"
                    />
                </div>

                <div className="flex items-center justify-between">
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
                    <span className="font-mono text-xs text-muted-foreground tabular-nums">
                        {formatTime(currentTime)} / {formatTime(duration)}
                    </span>
                </div>
            </div>

            {/* Timestamps */}
            {timestamps.length > 0 && (
                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                    <h3 className="mono-label mb-3">Topics &amp; Timestamps</h3>
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
                                    <span className="whitespace-nowrap rounded-sm border border-border bg-secondary px-2 py-1 font-mono text-[10px] text-muted-foreground tabular-nums">
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
