import { Eye, Monitor } from 'lucide-react'
import type { ProjectFiles } from '../../functions/agent/projectFiles'
import { buildPreviewDocument, previewSandbox } from '../projectState'

type WebsitePreviewProps = { files: ProjectFiles }

export function WebsitePreview({ files }: WebsitePreviewProps) {
  return (
    <section className="website-preview panel" aria-labelledby="preview-title">
      <div className="section-heading">
        <div className="section-title-wrap">
          <span className="section-icon results-icon"><Eye size={15} /></span>
          <div><h2 id="preview-title">Live preview</h2><p>Isolated website sandbox</p></div>
        </div>
        <span className="preview-device"><Monitor size={13} /> DESKTOP</span>
      </div>
      <div className="preview-frame-wrap">
        <iframe
          title="Generated website preview"
          className="preview-frame"
          sandbox={previewSandbox}
          referrerPolicy="no-referrer"
          srcDoc={buildPreviewDocument(files)}
        />
      </div>
      <p className="preview-safety-note">Generated code runs only in this sandboxed preview. Network access and form submission are blocked.</p>
    </section>
  )
}
