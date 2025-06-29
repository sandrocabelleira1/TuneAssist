import EcuTuningAssistant from '@/components/ecu-tuning-assistant';

export default function TuningPage({ params }: { params: { projectId: string } }) {
  return (
    // Pass the projectId to the component if it needs to fetch project-specific data
    <div className="p-4 md:p-8">
      <EcuTuningAssistant />
    </div>
  );
}
