const service=require("../services/pharmacyService");
async function list(req,res){res.json({success:true,message:"Pharmacies retrieved successfully",data:await service.pharmacies()});}
async function get(req,res){res.json({success:true,message:"Pharmacy retrieved successfully",data:await service.pharmacy(req.params.pharmacyId)});}
async function inventory(req,res){res.json({success:true,message:"Inventory retrieved successfully",data:await service.inventory(req.user,req.params.pharmacyId)});}
async function createBatch(req,res){const id=await service.createBatch(req.user,req.params.pharmacyId,req.body||{});res.status(201).json({success:true,message:"Batch created successfully",data:{batch_id:id}});}
async function quantity(req,res){res.json({success:true,message:"Batch quantity updated successfully",data:await service.updateQuantity(req.user,req.params.batchId,req.body||{})});}
async function updateBatch(req,res){res.json({success:true,message:"Batch updated successfully",data:await service.updateBatch(req.user,req.params.batchId,req.body||{})});}
async function remove(req,res){await service.removeBatch(req.user,req.params.batchId);res.status(204).end();}
async function lowStock(req,res){res.json({success:true,message:"Low-stock medicines retrieved successfully",data:await service.lowStock(req.user,req.params.pharmacyId)});}
async function expiring(req,res){res.json({success:true,message:"Expiring batches retrieved successfully",data:await service.expiring(req.user,req.params.pharmacyId,req.query)});}
module.exports={expiring,lowStock,createBatch,get,inventory,list,quantity,remove,updateBatch};
