const assistantService = require('./assistant.service');
const excel = require('exceljs');

// --- 1. Create Controller (Existing) ---
const create = async (req, res) => {
  try {
    const assistant = await assistantService.createAssistant(req.body);

    res.status(201).json({
      message: 'Assistant created successfully',
      assistant: assistant
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// --- 2. List Controller (Existing) ---
const list = async (req, res) => {
  try {
    // Extract page and limit along with user_id
    const { user_id, page, limit } = req.query;

    if (!user_id) {
      return res.status(400).json({ error: 'user_id query parameter is required' });
    }

    // Build a query parameters object
    const queryParams = {};
    if (page) queryParams.page = page;
    if (limit) queryParams.limit = limit;

    // Pass the queryParams to the service
    const result = await assistantService.listAssistants(user_id, queryParams);
    res.status(200).json(result);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// --- 3. Details Controller (Existing) ---
const details = async (req, res) => {
  try {
    const { user_id } = req.query;
    const { id } = req.params;

    if (!user_id) {
      return res.status(400).json({ error: 'user_id query parameter is required' });
    }

    if (!id) {
      return res.status(400).json({ error: 'Assistant ID is required' });
    }

    const result = await assistantService.getAssistantDetails(user_id, id);
    res.status(200).json(result);

  } catch (error) {
    if (error.message === 'Assistant not found in external system') {
      return res.status(404).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
};

// --- 4. Update Controller (Existing) ---
const update = async (req, res) => {
  try {
    const { id } = req.params; 
    const { user_id, ...updateData } = req.body; 

    if (!user_id) {
      return res.status(400).json({ error: 'user_id is required in the request body' });
    }

    if (!id) {
      return res.status(400).json({ error: 'Assistant ID is required' });
    }

    const result = await assistantService.updateAssistant(user_id, id, updateData);
    res.status(200).json(result);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// --- 5. Delete Controller (New) ---
const deleteAssistant = async (req, res) => {
  try {
    const { id } = req.params;
    // user_id can be sent in query string or body depending on frontend implementation
    const userId = req.query.user_id || req.body.user_id;

    if (!userId) {
      return res.status(400).json({ error: 'user_id is required' });
    }

    if (!id) {
      return res.status(400).json({ error: 'Assistant ID is required' });
    }

    const result = await assistantService.deleteAssistant(userId, id);
    res.status(200).json(result);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getCallLogs = async (req, res) => {
  try {
    const { id } = req.params; // The assistant ID
    // Extract user_id and all possible LiveKit query parameters
    const { 
      user_id, 
      page, 
      limit, 
      start_date, 
      end_date, 
      sort_by, 
      sort_order 
    } = req.query;

    if (!user_id || !id) {
      return res.status(400).json({ error: 'user_id and assistant id are required' });
    }

    // Build queryParams object dynamically, only including defined parameters
    const queryParams = {};
    if (page) queryParams.page = page;
    if (limit) queryParams.limit = limit;
    if (start_date) queryParams.start_date = start_date;
    if (end_date) queryParams.end_date = end_date;
    if (sort_by) queryParams.sort_by = sort_by;
    if (sort_order) queryParams.sort_order = sort_order;

    const result = await assistantService.getCallLogs(user_id, id, queryParams);
    
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// --- 7. Get Billable Minutes Controller (New) ---
const getBillableMinutes = async (req, res) => {
  try {
    const { id } = req.params; // The assistant ID
    const { 
      user_id, 
      to_number,
      start_date, 
      end_date 
    } = req.query;

    if (!user_id || !id) {
      return res.status(400).json({ error: 'user_id and assistant id are required' });
    }
    
    if (!to_number) {
      return res.status(400).json({ error: 'to_number query parameter is required' });
    }

    const queryParams = { to_number };
    if (start_date) queryParams.start_date = start_date;
    if (end_date) queryParams.end_date = end_date;

    const result = await assistantService.getTotalBillableDuration(user_id, id, queryParams);
    
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// --- 8. Get Platform Wise Billable Minutes Controller ---
const getPlatformWiseBillableMinutes = async (req, res) => {
  try {
    const { user_id, start_date, end_date } = req.query;

    if (!user_id) {
      return res.status(400).json({ error: 'user_id query parameter is required' });
    }

    const queryParams = {};
    if (start_date) queryParams.start_date = start_date;
    if (end_date) queryParams.end_date = end_date;

    const result = await assistantService.getPlatformWiseBillableMinutes(user_id, queryParams);
    
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// --- 9. Download Platform Wise Billable Minutes Controller ---
const downloadPlatformWiseBillableMinutes = async (req, res) => {
  try {
    const { user_id, start_date, end_date } = req.query;

    if (!user_id) {
      return res.status(400).json({ error: 'user_id query parameter is required' });
    }

    const queryParams = {};
    if (start_date) queryParams.start_date = start_date;
    if (end_date) queryParams.end_date = end_date;

    // Fetch the aggregated data using the service we already built
    const result = await assistantService.getPlatformWiseBillableMinutes(user_id, queryParams);

    if (!result.success || !result.data || !result.data.platform_wise_minutes) {
      return res.status(400).json({ error: 'Failed to retrieve data for export' });
    }

    const data = result.data.platform_wise_minutes;
    const evalStartDate = result.data.timespan_evaluated.start_date;
    const evalEndDate = result.data.timespan_evaluated.end_date;

    // Create a new Excel workbook and worksheet
    const workbook = new excel.Workbook();
    const worksheet = workbook.addWorksheet('Billable Minutes');

    // Define the columns requested
    worksheet.columns = [
      { header: 'Start Date', key: 'start_date', width: 20 },
      { header: 'End Date', key: 'end_date', width: 20 },
      { header: 'Phone Numbers', key: 'phone_numbers', width: 25 },
      { header: 'Billable Minutes', key: 'billable_minutes', width: 20 }
    ];

    // Add styling to headers (optional, makes it look nicer)
    worksheet.getRow(1).font = { bold: true };

    // Add rows from the aggregated data
    data.forEach(item => {
      worksheet.addRow({
        start_date: evalStartDate === 'lifetime' ? 'Lifetime' : evalStartDate,
        end_date: evalEndDate === 'lifetime' ? 'Lifetime' : evalEndDate,
        phone_numbers: item.platform_number,
        billable_minutes: item.total_billable_minutes
      });
    });

    // Set response headers to trigger file download in the browser
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename=' + `platform_billable_minutes.xlsx`
    );

    // Write the workbook to the response stream
    await workbook.xlsx.write(res);
    res.status(200).end();

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  create,
  list,
  details,
  update,
  deleteAssistant, // Export the new function
  getCallLogs,
  getBillableMinutes,
  getPlatformWiseBillableMinutes,
  downloadPlatformWiseBillableMinutes
};