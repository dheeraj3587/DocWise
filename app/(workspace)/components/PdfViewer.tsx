export const PdfViewer = ({ fileUrl }: { fileUrl: string }) => {
    return (
        <main className="relative flex h-full min-w-0 flex-col bg-[#0b0c10]">
            <iframe
                src={fileUrl + "#toolbar=0"}
                title="PDF Viewer"
                className="h-full w-full border-none bg-[#0b0c10]"
            />
        </main>
    )
}
