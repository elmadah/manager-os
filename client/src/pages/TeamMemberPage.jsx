import { useParams } from 'react-router-dom';

export default function TeamMemberPage() {
  const { id } = useParams();
  return <h1 className="text-3xl font-bold text-gray-900">Team Member {id}</h1>;
}
