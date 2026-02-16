export const PdfViewer = ({ fileUrl }: { fileUrl: string }) => {
    return (
        <div className="h-full glass rounded-xl overflow-hidden">
            <iframe
                src={fileUrl + "#toolbar=0"}
                title="PDF Viewer"
                className="border-none h-full w-full rounded-xl"
            />
        </div>
    )
}
