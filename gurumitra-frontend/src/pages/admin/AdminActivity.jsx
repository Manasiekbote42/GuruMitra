import { useState, useEffect } from 'react';
import Card from '../../components/Card';
import Table from '../../components/Table';
import { adminGetActivity } from '../../services/api';

export default function AdminActivity() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminGetActivity(100)
      .then(setData)
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, []);

  const columns = [
    { key: 'action', label: 'Action' },
    { key: 'actor_email', label: 'Actor' },
    {
      key: 'details',
      label: 'Details',
      render: (v) => (v ? <span className="text-xs font-mono">{JSON.stringify(v)}</span> : '—'),
    },
    { key: 'created_at', label: 'Time', render: (v) => (v ? new Date(v).toLocaleString() : '—') },
  ];

  return (
    <Card title="System Activity">
      {loading ? (
        <div className="animate-pulse h-40 bg-gray-100 rounded" />
      ) : (
        <Table columns={columns} data={data} keyField="id" emptyMessage="No activity" />
      )}
    </Card>
  );
}
