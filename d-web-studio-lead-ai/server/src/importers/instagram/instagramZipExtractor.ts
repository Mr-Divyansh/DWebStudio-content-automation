import AdmZip from 'adm-zip';
import fs from 'fs';
import path from 'path';

export interface ZipExtractionResult {
  success: boolean;
  zipFilePath: string;
  extractedPath: string;
  filesDiscovered: number;
  supportedFiles: string[];
  unsupportedFiles: string[];
  errors: string[];
}

export class InstagramZipExtractor {
  static getExportFolder(): string {
    const dir = path.resolve(process.cwd(), 'data', 'instagram', 'export');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  static findZipInExportFolder(): string | null {
    const dir = this.getExportFolder();
    const files = fs.readdirSync(dir);
    const zip = files.find((f) => f.toLowerCase().endsWith('.zip'));
    return zip ? path.join(dir, zip) : null;
  }

  static extractZip(zipFilePath: string, destinationDir?: string): ZipExtractionResult {
    const result: ZipExtractionResult = {
      success: false,
      zipFilePath,
      extractedPath: '',
      filesDiscovered: 0,
      supportedFiles: [],
      unsupportedFiles: [],
      errors: [],
    };

    if (!fs.existsSync(zipFilePath)) {
      result.errors.push(`ZIP file does not exist at path: ${zipFilePath}`);
      return result;
    }

    try {
      const targetDir = destinationDir || path.join(
        path.dirname(zipFilePath),
        `extracted_${Date.now()}`
      );

      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      const zip = new AdmZip(zipFilePath);
      const zipEntries = zip.getEntries();
      result.filesDiscovered = zipEntries.length;

      // Extract all entries safely
      zip.extractAllTo(targetDir, true);
      result.extractedPath = targetDir;

      // Inspect extracted files
      for (const entry of zipEntries) {
        if (entry.isDirectory) continue;
        const entryName = entry.entryName.toLowerCase();

        // Check for Instagram messages formats
        if (
          entryName.includes('message_') && entryName.endsWith('.json') ||
          entryName.endsWith('direct_messages.json') ||
          entryName.includes('messages/inbox') ||
          entryName.includes('personal_information.json')
        ) {
          result.supportedFiles.push(path.join(targetDir, entry.entryName));
        } else {
          result.unsupportedFiles.push(entry.entryName);
        }
      }

      result.success = true;
    } catch (err: any) {
      console.error('Error extracting ZIP:', err);
      result.errors.push(`ZIP extraction failure: ${err?.message || 'Unknown error'}`);
    }

    return result;
  }
}
