import React from 'react';
import { FaInbox } from 'react-icons/fa';

/**
 * ReportTable — A global, premium data-table component for all system reports.
 */
export default function ReportTable({ 
  columns = [], 
  data = [], 
  emptyIcon = null, 
  emptyTitle = 'No records found', 
  emptyText = 'Adjust your filters or try a different search.',
  footer = null,
  accentColor = '#f97316'
}) {
  return (
    <div className="table-container">
      <table className="premium-table">
        <thead>
          <tr>
            {columns.map((col, idx) => (
              <th 
                key={col.key || idx} 
                className={col.align === 'right' ? 'rt-right' : col.align === 'center' ? 'rt-center' : ''}
                style={col.width ? { width: col.width } : {}}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length > 0 ? (
            data.map((row, rowIdx) => (
              <tr key={row.id || rowIdx}>
                {columns.map((col, colIdx) => (
                  <td 
                    key={col.key || colIdx}
                    className={col.align === 'right' ? 'rt-right' : col.align === 'center' ? 'rt-center' : ''}
                  >
                    {col.render ? col.render(row, rowIdx) : row[col.key]}
                  </td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={columns.length}>
                <div className="empty-cell">
                  <div className="empty-icon">{emptyIcon || <FaInbox />}</div>
                  <h3>{emptyTitle}</h3>
                  <p>{emptyText}</p>
                </div>
              </td>
            </tr>
          )}
        </tbody>
        {footer && data.length > 0 && (
          <tfoot>
            {footer}
          </tfoot>
        )}
      </table>

      <style jsx>{`
        .table-container {
          width: 100%;
          overflow-x: auto;
          background: white;
          border: 1px solid #e2e8f0;
          border-radius: 16px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.02);
          padding: 0;
        }
        .premium-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 13px;
          text-align: left;
          min-width: 700px;
        }
        .premium-table th {
          padding: 14px 20px;
          background: #ffffff;
          color: #64748b;
          font-weight: 700;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          border-bottom: 2px solid ${accentColor || '#FF7A00'};
          white-space: nowrap;
        }
        .premium-table td {
          padding: 14px 20px;
          border-bottom: 1px solid #f1f5f9;
          color: #1e293b;
          vertical-align: middle;
          font-weight: 500;
        }
        .premium-table tbody tr:hover td {
          background-color: #fffbf5;
        }
        .premium-table tbody tr:last-child td {
          border-bottom: none;
        }
        .rt-right { text-align: right; }
        .rt-center { text-align: center; }
        
        .empty-cell {
          padding: 60px 20px;
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        .empty-icon {
          font-size: 40px;
          color: #e2e8f0;
          margin-bottom: 16px;
        }
        .empty-cell h3 {
          margin: 0 0 8px;
          font-size: 15px;
          font-weight: 800;
          color: #475569;
        }
        .empty-cell p {
          margin: 0;
          font-size: 12px;
          color: #94a3b8;
        }
        
        tfoot td {
          padding: 16px 20px;
          background: #f8fafc;
          border-top: 1px solid #e2e8f0;
          font-weight: 800;
          color: #0f172a;
        }
      `}</style>
    </div>
  );
}
