interface GoButtonProps {
  disabled: boolean;
  onClick: () => void;
}

export default function GoButton({ disabled, onClick }: GoButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-8 py-3 text-lg font-bold rounded-lg transition-colors ${
        disabled
          ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
          : 'bg-green-500 hover:bg-green-600 text-white cursor-pointer'
      }`}
    >
      GO
    </button>
  );
}
