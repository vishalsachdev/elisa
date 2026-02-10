const tabs = ['Timeline', 'Tests', 'Board', 'Learn'];

export default function BottomBar() {
  return (
    <div className="flex items-center gap-1 px-4 py-1 bg-gray-100 border-t border-gray-200">
      {tabs.map((tab) => (
        <button
          key={tab}
          disabled
          className="px-3 py-1 text-xs rounded bg-gray-200 text-gray-400 cursor-not-allowed"
        >
          {tab}
        </button>
      ))}
    </div>
  );
}
