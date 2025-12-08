import { Button } from "@/components/ui/button";

interface DashboardHeaderProps {
  title: string;
  subtitle?: string;
  lastUpdated?: string;
  onExport?: () => void;
  onImport?: () => void;
  onImportClick?: () => void;
  showExport?: boolean;
  showImport?: boolean;
  importLabel?: string;
  exportLabel?: string;
}

export default function DashboardHeader({
  title,
  subtitle,
  lastUpdated,
  onExport,
  onImport,
  onImportClick,
  showExport = true,
  showImport = true,
  importLabel = "Import from Google Sheets",
  exportLabel = "Export"
}: DashboardHeaderProps) {
  return (
    <div className="bg-white shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between">
          <div className="flex-1 min-w-0">
            <h2 className="text-2xl font-bold leading-7 text-gray-900 sm:text-3xl sm:truncate">
              {title}
            </h2>
            {subtitle && (
              <p className="mt-1 text-sm text-gray-500">{subtitle}</p>
            )}
            {lastUpdated && (
              <div className="mt-1 flex flex-col sm:flex-row sm:flex-wrap sm:mt-0 sm:space-x-6">
                <div className="mt-2 flex items-center text-sm text-gray-500">
                  <i className="fa-solid fa-calendar-check mr-1.5"></i>
                  {lastUpdated}
                </div>
              </div>
            )}
          </div>
          <div className="mt-4 flex md:mt-0 md:ml-4 space-x-3">
            {showExport && (
              <Button 
                variant="outline" 
                className="flex items-center" 
                onClick={onExport}
              >
                <i className="fa-solid fa-file-export mr-2"></i>
                {exportLabel}
              </Button>
            )}
            {showImport && (
              <Button 
                className="bg-fb-blue hover:bg-blue-700 flex items-center" 
                onClick={onImportClick || onImport}
              >
                <i className="fa-solid fa-plus mr-2"></i>
                {importLabel}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
