const excel = require('exceljs');

const badRequest = (message) => {
  const error = new Error(message);
  error.status = 400;
  return error;
};

/**
 * Build the platform-wise billable minutes xlsx workbook from the aggregated
 * service result. Throws 400 when the data needed for the export is missing.
 */
const buildPlatformBillableWorkbook = (result) => {
  if (!result.success || !result.data || !result.data.platform_wise_minutes) {
    throw badRequest('Failed to retrieve data for export');
  }

  const data = result.data.platform_wise_minutes;
  const evalStartDate = result.data.timespan_evaluated.start_date;
  const evalEndDate = result.data.timespan_evaluated.end_date;

  const workbook = new excel.Workbook();
  const worksheet = workbook.addWorksheet('Billable Minutes');

  worksheet.columns = [
    { header: 'Start Date', key: 'start_date', width: 20 },
    { header: 'End Date', key: 'end_date', width: 20 },
    { header: 'Phone Numbers', key: 'phone_numbers', width: 25 },
    { header: 'Billable Minutes', key: 'billable_minutes', width: 20 }
  ];

  worksheet.getRow(1).font = { bold: true };

  data.forEach(item => {
    worksheet.addRow({
      start_date: evalStartDate === 'lifetime' ? 'Lifetime' : evalStartDate,
      end_date: evalEndDate === 'lifetime' ? 'Lifetime' : evalEndDate,
      phone_numbers: item.platform_number,
      billable_minutes: item.total_billable_minutes
    });
  });

  return workbook;
};

module.exports = { buildPlatformBillableWorkbook };
