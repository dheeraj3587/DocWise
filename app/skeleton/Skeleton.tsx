interface SkeletonProps {
    className?: string
}

export const Skeleton = ({ className = "" }: SkeletonProps) => {
    return (
        <div
            className={`animate-pulse surface-3 rounded-lg ${className}`}
        />
    )
}
