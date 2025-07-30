import EcuTuningAssistant from '@/components/ecu-tuning-assistant';

export default function TuningPage({ params }: { params: { projectId: string } }) {
  return (
    // Pass the projectId to the component if it needs to fetch project-specific data
    <div className="flex-1 flex flex-col min-h-0 bg-muted/40">
      <EcuTuningAssistant />
    </div>
  );
}
