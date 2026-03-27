type Folder = {
  id: number;
  name: string;
};

export default function FolderTree({
  folders,
  onSelect,
  selectedId
}: {
  folders: Folder[];
  onSelect: (id: number | null) => void;
  selectedId: number | null;
}) {
  const selectedStyle = {
    background: "#dceeff",
    color: "#0f2a44",
    fontWeight: 700,
    borderRadius: 4,
    padding: "4px 6px"
  } as const;

  return (
    <div
      style={{
        width: 240,
        borderRight: "1px solid #ddd",
        padding: 12
      }}
    >
      <h4>Folders</h4>

      <div
        style={{
          cursor: "pointer",
          marginBottom: 8,
          ...(selectedId === null ? selectedStyle : {})
        }}
        onClick={() => onSelect(null)}
      >
        All Documents
      </div>

      {folders.map((folder) => (
        <div
          key={folder.id}
          style={{
            cursor: "pointer",
            marginBottom: 6,
            ...(selectedId === folder.id ? selectedStyle : {})
          }}
          onClick={() => onSelect(folder.id)}
        >
          {folder.name}
        </div>
      ))}
    </div>
  );
}
