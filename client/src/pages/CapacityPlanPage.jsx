import { useParams } from 'react-router-dom';

export default function CapacityPlanPage() {
  const { id } = useParams();
  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Capacity Plan #{id}</h1>
      <p className="text-gray-500">Plan detail — coming next.</p>
    </div>
  );
}
