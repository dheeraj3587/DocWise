export const PdfViewer = ({ fileUrl }: { fileUrl: string }) => {
    return (
        <div className="h-full glass rounded-xl overflow-hidden">
            <iframe src={fileUrl + "#toolbar=0"} height="90vh" width="100%" className='border-none h-[90vh] rounded-xl' />
        </div>
    )
}
