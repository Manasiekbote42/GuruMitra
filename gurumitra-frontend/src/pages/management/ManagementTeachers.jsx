import { useState, useEffect } from 'react';
import Card from '../../components/Card';
import Table from '../../components/Table';
import { managementGetTeachers } from '../../services/api';

export default function ManagementTeachers() {
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    managementGetTeachers()
      .then(setTeachers)
      .catch(() => setTeachers([]))
      .finally(() => setLoading(false));
  }, []);

  const columns = [
    { key: 'name', label: 'Name' },
    { key: 'department', label: 'Department', render: (v) => v || '—' },
    { key: 'email', label: 'Email' },
    {
      key: 'id',
      label: 'Action',
      render: () => (
        <button type="button" className="text-sm text-primary-600 hover:text-primary-700 font-medium">
          View report
        </button>
      ),
    },
  ];

  return (
    <Card title="Teachers">
      {loading ? (
        <div className="animate-pulse h-40 bg-gray-100 rounded" />
      ) : (
        <Table columns={columns} data={teachers} keyField="id" emptyMessage="No teachers" />
      )}
    </Card>
  );
}
