import { useState, useEffect } from 'react';
import Card from '../../components/Card';
import { teacherGetRecommendations } from '../../services/api';

export default function TeacherTraining() {
  const [data, setData] = useState({ modules: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    teacherGetRecommendations()
      .then(setData)
      .catch(() => setData({ modules: [] }))
      .finally(() => setLoading(false));
  }, []);

  const modules = data.modules || [];

  return (
    <div className="space-y-6">
      <Card title="Training Recommendations">
        <p className="text-sm text-gray-600 mb-6">
          Recommended modules based on your recent sessions. View or start training to improve your teaching.
        </p>
        {loading ? (
          <div className="animate-pulse space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 bg-gray-100 rounded-lg" />
            ))}
          </div>
        ) : (
          <ul className="space-y-4">
            {modules.map((m) => (
              <li
                key={m.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border border-gray-200 hover:border-primary-200 bg-gray-50/50"
              >
                <div>
                  <h4 className="font-semibold text-gray-800">{m.title}</h4>
                  <p className="text-sm text-gray-600 mt-1">{m.description}</p>
                  <span className="inline-block mt-2 text-xs text-gray-500">
                    {m.duration} · {m.priority}
                  </span>
                </div>
                <div className="flex gap-2 mt-3 sm:mt-0">
                  <button
                    type="button"
                    className="px-4 py-2 rounded-lg bg-gray-200 text-gray-700 text-sm font-medium hover:bg-gray-300"
                  >
                    View
                  </button>
                  <button
                    type="button"
                    className="px-4 py-2 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700"
                  >
                    Start
                  </button>
                </div>
              </li>
            ))}
            {!modules.length && (
              <li className="text-center py-8 text-gray-500 text-sm">
                No training modules yet. Complete a session to get recommendations.
              </li>
            )}
          </ul>
        )}
      </Card>
    </div>
  );
}
