const service = require("../services/reminderService");
async function create(req,res){res.status(201).json({success:true,message:"Reminder created successfully",data:await service.create(req.user.patientId,req.body||{})});}
async function list(req,res){res.json({success:true,message:"Reminders retrieved successfully",data:await service.list(req.user.patientId)});}
async function due(req,res){res.json({success:true,message:"Due reminders retrieved successfully",data:await service.due(req.user.patientId)});}
async function update(req,res){res.json({success:true,message:"Reminder updated successfully",data:await service.updateStatus(req.user.patientId,req.params.reminderId,(req.body||{}).status)});}
async function remove(req,res){await service.remove(req.user.patientId,req.params.reminderId);res.status(204).end();}
module.exports={create,due,list,remove,update};
