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

export const MediaPlayer = ({ fileUrl, fileType, timestamps = [] }: MediaPlayerProps) => {
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
            // Highlight active timestamp
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
        <div className="flex flex-col h-full bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            {/* Media Element */}
            <div className="flex-shrink-0 bg-black flex items-center justify-center">
                {fileType === 'video' ? (
                    <video
                        ref={mediaRef as React.RefObject<HTMLVideoElement>}
                        src={fileUrl}
                        className="w-full max-h-[50vh] object-contain"
                        preload="metadata"
                    />
                ) : (
                    <div className="w-full py-16 flex items-center justify-center bg-gradient-to-br from-indigo-50 to-purple-50">
                        <div className="text-6xl">🎧</div>
                        <audio
                            ref={mediaRef as React.RefObject<HTMLAudioElement>}
                            src={fileUrl}
                            preload="metadata"
                        />
                    </div>
                )}
            </div>

            {/* Controls */}
            <div className="flex-shrink-0 p-4 border-b border-slate-200">
                {/* Progress bar */}
                <div
                    className="w-full h-2 bg-slate-200 rounded-full cursor-pointer mb-3"
                    onClick={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect()
                        const pos = (e.clientX - rect.left) / rect.width
                        seekTo(pos * duration)
                    }}
                >
                    <div
                        className="h-full bg-indigo-500 rounded-full transition-all duration-100"
                        style={{ width: `${progressPercent}%` }}
                    />
                </div>

                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" onClick={() => skip(-10)}>
                            <SkipBack size={16} />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={togglePlay}>
                            {isPlaying ? <Pause size={20} /> : <Play size={20} />}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => skip(10)}>
                            <SkipForward size={16} />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={toggleMute}>
                            {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                        </Button>
                    </div>
                    <span className="text-sm text-slate-500 font-mono">
                        {formatTime(currentTime)} / {formatTime(duration)}
                    </span>
                </div>
            </div>

            {/* Timestamps / Topics */}
            {timestamps.length > 0 && (
                <div className="flex-1 overflow-y-auto p-4">
                    <h3 className="text-sm font-semibold text-slate-700 mb-3">Topics &amp; Timestamps</h3>
                    <div className="space-y-2">
                        {timestamps.map((ts, index) => (
                            <button
                                key={ts.id || index}
                                onClick={() => seekTo(ts.start_time)}
                                className={`w-full text-left p-3 rounded-lg border transition-all duration-200 hover:bg-indigo-50 hover:border-indigo-300 ${
                                    activeTimestamp === index
                                        ? 'bg-indigo-50 border-indigo-400 shadow-sm'
                                        : 'bg-white border-slate-200'
                                }`}
                            >
                                <div className="flex items-center gap-3">
                                    <span className="text-xs font-mono text-indigo-600 bg-indigo-100 px-2 py-1 rounded whitespace-nowrap">
                                        {formatTime(ts.start_time)}
                                    </span>
                                    <div className="flex-1 min-w-0">
                                        {ts.topic && (
                                            <p className="text-sm font-medium text-slate-900 truncate">
                                                {ts.topic}
                                            </p>
                                        )}
                                        <p className="text-xs text-slate-500 truncate">{ts.text}</p>
                                    </div>
                                    <Play size={14} className="text-slate-400 flex-shrink-0" />
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}
