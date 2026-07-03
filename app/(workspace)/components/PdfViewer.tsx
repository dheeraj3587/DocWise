export const PdfViewer = ({ fileUrl, page = 1 }: { fileUrl: string; page?: number }) => {
    const src = `${fileUrl}#toolbar=0&page=${page}`

    return (
        <main className="relative flex h-full min-w-0 flex-col bg-[#0b0c10]">
            <iframe
                key={src}
                src={src}
                title="PDF Viewer"
                className="h-full w-full border-none bg-[#0b0c10]"
            />
        </main>
    )
}
